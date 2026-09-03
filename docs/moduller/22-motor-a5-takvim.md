# A5 — Takvim / Plan Motoru (kurulum)

> **⛔ UYGULANMADI — bu bir tasarım belgesidir.**
>
> `ModulePlanConfig`, tekrar kuralı ve görev üretimi kodda **yok**. Bugün var olan tek şey, hangi modülün takvim/plan yüzeyine ait
> olduğunu söyleyen anahtar listesi (`apps/web/src/lib/moduleSurfaces.ts`) —
> motorun kendisi değil, yalnızca yüzey eşlemesi.
>
> Aşağıdaki "bugünkü kod şunu yapıyor" cümleleri belge yazıldığı **2026-08-15**
> tarihine aittir. Motor yazılacaksa bu tasarım başlangıç noktasıdır; ama önce
> kodun bugünkü hâline karşı yeniden doğrulanmalı.

> Kapsam: **veri modeli + tekrar kuralı + görev üretimi + 5 modülün kurulumu.** Takvim ızgarası, sürükle-taşı ve zaman çizelgesi görünümü bu turda yok — görünümler ayrı turda.
>
> Bu motora düşen modüller: `pd_sosyal_medya` (referans), `pd_email`, `pd_reklam`, `ik_egitim_gelisim`, `fm_vergi_takip` → **5 modül**

---

## 1. Ayırt edici kural

Kaydın bir **planlanmış zamanı** vardır ve plan **işe dönüşür**. Üç şey A5'i A2'den ayırır:

1. **Tekrar kuralı** — "her ayın 25'i", "her Salı", "her çeyreğin sonu"
2. **Görev üretimi** — plan kaydı, çekirdek `tasks` içinde bir göreve dönüşür ve sorumluya düşer
3. **Plan / gerçekleşme ayrımı** — planlandı → yayımlandı/yapıldı → iptal; gerçekleşme sonucu ayrı alanlarda tutulur

Bugün bu 5 modül birer `date` alanı olan kayıt listesi. "25'inde KDV beyannamesi" her ay elle giriliyor; giren unutursa hiçbir şey olmuyor.

**İyi haber:** tekrar motoru zaten var — `operation_routines` (021) tam bir RRULE alt kümesi uyguluyor (`freq`, `interval_n`, `byweekday`, `bymonthday`, `bysetpos`, `bymonth`, `generate_ahead_days`, `last_materialized_on`). A5 bu motoru **yeniden yazmaz, ortaklaştırır.**

---

## 2. Veri modeli

### 2.1 `plan_entry` — planlanmış kayıt

```sql
create table public.plan_entry (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete cascade,
  department_id    uuid references public.departments(id) on delete set null,
  module_key       varchar not null references public.module_catalog(key) on delete cascade,

  title            varchar not null,
  channel          varchar,                    -- instagram | email | google_ads | egitim | kdv …
  scheduled_at     timestamp not null,         -- planlanan an
  ends_at          timestamp,                  -- süreli planlar (reklam kampanyası, eğitim)
  all_day          boolean not null default true,

  status           varchar not null default 'planned'
                   check (status in ('planned','ready','published','done','cancelled','missed')),

  assignee_id      uuid references public.users(id) on delete set null,
  task_id          uuid references public.tasks(id) on delete set null,   -- ürettiği görev
  routine_id       uuid references public.plan_routine(id) on delete set null, -- ürettiyse kaynağı

  amount           numeric(14,2),              -- planlanan bütçe (reklam)
  currency         varchar(3),

  data             jsonb not null default '{}'::jsonb,  -- modüle özel alanlar + sonuç metrikleri

  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamp not null default current_timestamp,
  archived_at      timestamp
);

create index plan_entry_calendar_idx
  on public.plan_entry (coalesce(organization_id, job_id), module_key, scheduled_at)
  where archived_at is null;
```

`missed` durumu bilinçli: tarihi geçmiş ve kapanmamış plan sessizce kaybolmaz, gece işi onu `missed` yapar ve sayılır. "Bu ay 12 içerikten 9'u yayımlandı" cümlesi ancak böyle kurulabilir.

### 2.2 `plan_routine` — tekrar kuralı

`operation_routines`'in alan alan aynısı, sahibi farklı:

```sql
create table public.plan_routine (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid references public.organizations(id) on delete cascade,
  job_id               uuid references public.jobs(id) on delete cascade,
  module_key           varchar not null references public.module_catalog(key) on delete cascade,

  title                varchar not null,
  channel              varchar,
  default_assignee     uuid references public.users(id),

  freq                 varchar not null check (freq in ('daily','weekly','monthly','yearly')),
  interval_n           integer not null default 1,
  byweekday            smallint[],
  bymonthday           smallint[],
  bysetpos             smallint,
  bymonth              smallint[],
  starts_on            date not null default current_date,
  ends_on              date,
  max_occurrences      integer,

  lead_days            integer not null default 0,   -- kaç gün önce görev düşsün
  generate_ahead_days  integer not null default 60,
  last_materialized_on date,

  data                 jsonb not null default '{}'::jsonb,
  active               boolean not null default true,
  archived_at          timestamp,
  created_at           timestamp not null default current_timestamp
);
```

> **Karar gerekiyor:** `operation_routines` ile bu tabloyu tek tabloda birleştirmek (polimorfik sahiplik) mi, ayrı tutup **kural hesaplayıcıyı** paylaşmak mı? Öneri: **ayrı tablo, ortak hesaplayıcı.** Tek tablo, çekirdek program mantığı ile modül planlamasını birbirine bağlar; ikisinin yaşam döngüsü farklı ve çekirdeği modül şemasına bağımlı kılmak İ2'ye aykırı. Hesaplayıcı (`nextOccurrences(rule, from, to)`) ortak bir yardımcıya çıkarılır ve iki taraf da onu çağırır.

---

## 3. Konfigürasyon şeması

```ts
export interface ModulePlanConfig {
  kind: "plan";
  title: string;
  addLabel: string;
  titleLabel: string;                  // "İçerik", "Kampanya", "Eğitim", "Beyanname"
  /** Kanal listesi — boşsa kanal alanı gösterilmez. */
  channels?: { value: string; label: string }[];
  /** Zaman: tek an mı, aralık mı. */
  timing: "moment" | "range";
  /** Durum akışı — hangi statüler kullanılıyor ve etiketleri. */
  statuses: { value: PlanStatus; label: string }[];
  /** Tekrar kuralı bu modülde açık mı. */
  recurring: boolean;
  /** Plan kaydı görev üretsin mi, ne zaman. */
  taskGeneration?: { titleTemplate: string; leadDays: number; assignTo: "assignee" | "module_managers" };
  /** Planlama alanları. */
  fields: ModuleFieldConfig[];
  /** Gerçekleşme sonrası doldurulan alanlar (yayım/gönderim sonrası). */
  resultFields?: ModuleFieldConfig[];
  /** Bütçe alanı money_entry'ye gider yazsın mı. */
  budgetEffect?: { direction: "expense"; category: string };
}
```

**Planlama alanı / sonuç alanı ayrımı** A5'in ikinci ayırt edici kararı: açılma oranı, erişim, harcanan bütçe planlarken değil, iş bittikten sonra girilir. Aynı formda göstermek boş kutu yığını üretiyor (bugün `emailCampaignConfig`'te tam olarak bu oluyor).

---

## 4. Motor davranışı

| Konu | Kural |
|---|---|
| Görev üretimi | `taskGeneration` doluysa plan kaydı oluşturulduğunda (veya rutinden doğduğunda) çekirdek görev açılır; `plan_entry.task_id` bağlar. Görev tamamlanınca plan `done` olur |
| Görev silinirse | Plan kalır, `task_id = null`. Ters yönde: plan iptal olursa görev de iptal edilir |
| Rutin materyalizasyonu | Gece işi, `generate_ahead_days` penceresine düşen tekrarları `plan_entry` olarak üretir; `last_materialized_on` ilerler. `operation_routines` ile aynı desen |
| Üretilmiş kaydı düzenleme | Serbest — kayıt doğduktan sonra rutinden bağımsızdır. Rutin değişirse **geçmiş kayıtlar değişmez**, gelecek üretimler değişir |
| Tek seferlik atlama | Kaydı `cancelled` yapmak yeter; rutin çalışmaya devam eder |
| Kaçırılan plan | Tarihi geçmiş ve `planned`/`ready` durumdaki kayıt gece işiyle `missed` olur, sorumluya bildirim |
| Bütçe | `budgetEffect` varsa `done` olduğunda `money_entry` gider kaydı **önerilir** (otomatik yazılmaz — çift kayıt riskini kullanıcı onaylar) |
| Onay akışı | `ready` durumu "onaya hazır" demek. Modül yöneticisi onaylayınca `published` olur. Onay zorunlu değil, konfigürasyonda `statuses` listesinden çıkarılabilir |

---

## 5. Modül kurulumları

### 5.1 `icerik_takvimi` — Sosyal Medya + E-mail (birleşik, referans)

`pd_sosyal_medya` + `pd_email` **tek modülde birleşiyor**; ayrım `channel`. Gerekçe: aynı motor, aynı onay akışı, aynı takvim; ayrı tutmak "bu hafta ne yayımlıyoruz" sorusunu iki ekrana bölüyor.

```
titleLabel: İçerik   ·   timing: moment   ·   recurring: true
channels: instagram · linkedin · x · facebook · tiktok · youtube · blog · email · sms
statuses: planned(Planlandı) · ready(Onaya hazır) · published(Yayımlandı) · cancelled · missed
taskGeneration: "{title} — {channel} yayını", leadDays: 1, assignTo: assignee
```

| Planlama alanı | Tip | Not |
|---|---|---|
| `title` | text | Başlık / konu |
| `channel` | select | Kanal |
| `scheduled_at` | datetime | Saatli — yayın saati önemli |
| `content_type` | select | Görsel, video, carousel, hikâye, yazı, bülten |
| `copy` | longtext | Metin taslağı |
| `asset_link` | text | Drive/OneDrive bağlantısı (`file` tipi gelince alan tipine döner) |
| `audience` | text | E-mail kanalında hedef liste |
| `campaign` | text | Kampanya etiketi — reklam modülüyle eşleşir |

| Sonuç alanı | Tip |
|---|---|
| `reach`, `engagement`, `clicks` | number |
| `recipient_count`, `open_rate`, `click_rate` | number (e-mail kanalı) |
| `result_note` | longtext |

### 5.2 `pd_reklam` — Reklam

Ayrı kalıyor: içerik değil **bütçe** yönetiyor, süreli (`range`) ve `money_entry`'ye yazıyor.

```
titleLabel: Kampanya   ·   timing: range   ·   recurring: false
channels: google · meta · linkedin · tiktok · yerel · basılı
statuses: planned · published(Yayında) · done(Bitti) · cancelled
budgetEffect: expense → "Pazarlama / Reklam"
```

Planlama: `title`, `channel`, `scheduled_at`(başlangıç), `ends_at`(bitiş), `amount`(bütçe, currency), `objective` (bilinirlik / trafik / dönüşüm / yeniden hedefleme), `target_audience`, `landing_url`
Sonuç: `spend` (gerçekleşen), `impressions`, `clicks`, `conversions`, `cpa` (formula: spend/conversions), `result_note`

`pd_musteri_kazanim_optimizasyonu` paneli CAC'ı buradan okur.

### 5.3 `ik_egitim_gelisim` — Eğitim ve Gelişim

```
titleLabel: Eğitim   ·   timing: range   ·   recurring: true
statuses: planned · published(Duyuruldu) · done(Tamamlandı) · cancelled · missed
taskGeneration: "{title} eğitimine katıl", leadDays: 3, assignTo: assignee
```

Planlama: `title`, `scheduled_at`, `ends_at`, `format` (yüz yüze / çevrimiçi / kayıt), `trainer` (text veya `user_ref`), `participants` (`user_ref` çoklu), `location`, `cost` (currency), `objective`
Sonuç: `attendance` (katılan sayısı), `feedback_score` (1–5), `certificate_link`, `result_note`

Katılımcı başına ayrı görev üretilir — "eğitime katıl" görevi herkesin kendi listesine düşer. `ik_performans_izleme` bu kayıtlardan "bu yıl kaç eğitim" okur.

### 5.4 `fm_vergi_takip` — Vergi Takip

A5'in en net örneği: içerik yok, **takvim ve hatırlatma** var.

```
titleLabel: Beyanname / Ödeme   ·   timing: moment   ·   recurring: true
channels(tür): kdv · muhtasar · gecici_vergi · kurumlar · sgk · damga · diger
statuses: planned · done(Verildi/Ödendi) · missed · cancelled
taskGeneration: "{title} son gün {date}", leadDays: 7, assignTo: assignee
```

Planlama: `title`, `channel`(vergi türü), `scheduled_at`(son tarih), `period_label` (ör. "2026/07"), `amount` (tahmini tutar), `authority` (kurum), `notes`
Sonuç: `paid_amount`, `paid_at`, `receipt_link`

**Kurulumda hazır rutinler gelir** (silinebilir): aylık KDV (ayın 28'i), aylık muhtasar (26'sı), üç aylık geçici vergi, yıllık kurumlar. Bu, A5'in "boş kutu sendromu"nu en görünür kıran yeri — modül açıldığı anda takvim dolu.

`fm_nakit_akis` paneli planlanan vergi ödemelerini gelecek çıkış olarak okur.

---

## 6. Göç

| Adım | İş |
|---|---|
| 1 | `plan_entry` + `plan_routine` (migration `051`); `nextOccurrences` hesaplayıcısını `operation_routines` servisinden ortak yardımcıya çıkar |
| 2 | `module_records` → `plan_entry`: `scheduledDate`/`sendDate`/`startDate`/`dueDate` → `scheduled_at`; `endDate` → `ends_at` |
| 3 | Durum eşlemesi: `draft → planned`, `scheduled/approved → ready`, `published/sent → published`, `completed → done`, `cancelled → cancelled` |
| 4 | Sosyal medya + e-mail kayıtları tek modülde birleşir; `channel` kaynağa göre doldurulur (e-mail kayıtları `channel = email`) |
| 5 | Sonuç alanları (`openRate`, `clickRate`, `recipientCount`) `data` içinde aynı adla kalır — kayıp yok |
| 6 | Vergi takip için hazır rutinler yalnızca **yeni açılan** modüllerde tohumlanır; mevcut kullanıcıya "hazır takvimi kur" teklifi olarak sunulur |

---

## 7. Bu motor bittiğinde

- 5 modül (birleşme sonrası 4) konfigürasyona düşer
- Çekirdek takvim sayfası ile modül planları aynı ızgarada gösterilebilir hale gelir
- "Planlandı ama yapılmadı" ilk kez ölçülebilir olur — A6 panelleri için yeni bir metrik ailesi
- Tekrar kuralı hesaplayıcısı ortaklaşır; `hud_sozlesme` yenileme ve `hud_marka_patent_telif` tescil hatırlatmaları da aynı yardımcıyı kullanır

**Tahmini büyüklük:** 1 migration (2 tablo) · 1 gece işi (materyalizasyon + `missed` işaretleme) · 1 panel bileşeni · 4 konfigürasyon. A4'ten sonra en çok kazandıran motor.
