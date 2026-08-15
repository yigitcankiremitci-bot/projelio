# A4 — Pipeline Motoru (kurulum)

> Kapsam: **veri modeli + konfigürasyon + davranış + 7 modülün aşama kurulumu.** Kanban yerleşimi, sürükle-bırak animasyonu ve huni grafiği bu turda yok — görünümler ayrı turda.
>
> Bu motora düşen modüller: `spd_satis_planlama_b2b_b2c` (referans), `ik_ise_alim_oryantasyon`, `mid_sikayet_oneri`, `mid_teknik_destek`, `oud_tedarik`, `oud_sevkiyat_yonetimi`, `oud_kalite_kontrol` → **7 modül**

---

## 1. Ayırt edici kural

Kayıt bir **aşamadan** diğerine geçer ve bu geçiş **kaydedilir**. Bugün 7 modülün hepsinde aşama sıradan bir `select` alanı: kimin ne zaman hangi aşamaya taşıdığı kayıp, "teklif aşamasında 12 gündür bekliyor" sorusu sorulamıyor, huni sayıları anlık durumdan okunuyor.

İkinci kural: **aşamalar veri değil konfigürasyondur.** Varsayılan aşama seti kod ile gelir, organizasyon kendi setini tanımlayabilir. Ürünün "kendi yapına uyarlanır" iddiasının en somut karşılığı burasıdır.

---

## 2. Veri modeli

Bu modüller `module_records` yerine kendi ortak varlığına taşınır.

### 2.1 `pipeline_stage` — aşama tanımı (konfigürasyon)

```sql
create table public.pipeline_stage (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete cascade,
  module_key       varchar not null references public.module_catalog(key) on delete cascade,

  key              varchar not null,          -- 'proposal'
  label            varchar not null,          -- 'Teklif verildi'
  sort_order       integer not null default 0,
  color            varchar(7),

  -- Aşamanın türü: motor davranışı buna bağlı.
  kind             varchar not null default 'active'
                   check (kind in ('active', 'won', 'lost', 'parked')),

  -- Bu aşamada bu kadar günden fazla bekleyen kayıt "takılmış" sayılır.
  sla_days         integer,

  archived_at      timestamp,
  created_at       timestamp not null default current_timestamp,

  unique (coalesce(organization_id, job_id), module_key, key)
);
```

`kind` neden var: motor "kazanıldı/kaybedildi" ayrımını isimden tahmin edemez. `won` ve `lost` aşamalar kaydı **kapatır**; `parked` (beklemede) SLA saymaz.

Organizasyon modülü ilk açtığında varsayılan set kopyalanır (satır olarak). Kopya kararı bilinçli: sonradan kod içindeki varsayılan değişirse çalışan şirketlerin süreci bozulmaz.

### 2.2 `pipeline_record` — kayıt

```sql
create table public.pipeline_record (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete cascade,
  department_id    uuid references public.departments(id) on delete set null,
  module_key       varchar not null references public.module_catalog(key) on delete cascade,

  title            varchar not null,          -- her modülde farklı anlam, hep dolu
  stage_id         uuid not null references public.pipeline_stage(id),
  stage_entered_at timestamp not null default current_timestamp,

  party_id         uuid references public.party(id) on delete set null,
  assignee_id      uuid references public.users(id) on delete set null,

  amount           numeric(14,2),             -- fırsat tutarı / sipariş tutarı
  currency         varchar(3),
  priority         varchar,                   -- low | normal | high | urgent
  due_at           date,

  data             jsonb not null default '{}'::jsonb,   -- modüle özel alanlar

  closed_at        timestamp,
  close_reason     varchar,                   -- lost aşamalarında zorunlu
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamp not null default current_timestamp,
  archived_at      timestamp
);
```

Ortak alanlar (`title`, `stage_id`, `party_id`, `assignee_id`, `amount`, `due_at`) kolon; modüle özel olanlar `data jsonb`. Sebep: motorun sorgulayacağı, sıralayacağı ve toplayacağı alanlar kolon olmalı — huni toplamı jsonb'den okunmaz.

### 2.3 `pipeline_stage_event` — geçiş kaydı

```sql
create table public.pipeline_stage_event (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references public.pipeline_record(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stage(id),
  to_stage_id   uuid not null references public.pipeline_stage(id),
  moved_by      uuid references public.users(id) on delete set null,
  moved_at      timestamp not null default current_timestamp,
  note          varchar,
  duration_days integer          -- önceki aşamada geçen gün, yazarken hesaplanır
);
```

`duration_days` okuma anında hesaplanabilirdi; yazarken hesaplanıyor çünkü huni/SLA raporları bunu tekrar tekrar toplayacak.

---

## 3. Konfigürasyon şeması

```ts
export interface ModulePipelineConfig {
  kind: "pipeline";
  title: string;
  addLabel: string;
  /** title alanının o modüldeki adı: "Fırsat", "Aday", "Talep"… */
  titleLabel: string;
  /** Ortak kolonlardan hangileri kullanılıyor. */
  uses: {
    party?: { role: string; label: string };   // entityRole ile sınırlı seçici
    assignee?: boolean;
    amount?: boolean;
    dueAt?: { label: string };
    priority?: boolean;
  };
  /** Varsayılan aşamalar — organizasyon açtığında pipeline_stage'e kopyalanır. */
  defaultStages: {
    key: string; label: string; kind?: "active" | "won" | "lost" | "parked"; slaDays?: number;
  }[];
  /** Modüle özel alanlar (data jsonb). */
  fields: ModuleFieldConfig[];
  /** Aşamaya girince zorunlu olan alanlar. */
  stageRequirements?: Record<string, string[]>;
  /** Aşamaya girince tetiklenen otomasyon. */
  stageEffects?: Record<string, PipelineEffect[]>;
}

type PipelineEffect =
  | { type: "create_task"; title: string; assignTo: "assignee" | "creator" }
  | { type: "create_money_entry"; direction: "income" | "expense" }
  | { type: "create_item_movement"; direction: "in" | "out" }
  | { type: "party_role_add"; role: string }
  | { type: "notify"; to: "assignee" | "module_managers" };
```

`stageEffects` motorun kalbi: "tedarik teslim alındı → depoya giriş", "fırsat kazanıldı → müşteri rolü ekle" gibi zincirler burada kuruluyor. İlke İ5 ("izole modül değersizdir") bu alanla somutlaşır.

---

## 4. Motor davranışı

| Konu | Kural |
|---|---|
| Aşama değişimi | Her değişim `pipeline_stage_event` yazar. Doğrudan `stage_id` güncellemesi servis katmanında yasak — tek giriş noktası `moveStage()` |
| Geri alma | Aşama geriye taşınabilir; olay yine yazılır (silinmez), `duration_days` negatif olmaz |
| Kapanış | `kind in (won, lost)` → `closed_at` damgalanır. `lost` ise `close_reason` zorunlu (konfigüre edilebilir sebep listesi) |
| Yeniden açma | Kapalı kayıt `active` aşamaya taşınırsa `closed_at = null`, olay kaydı kalır |
| SLA | `stage_entered_at + sla_days` geçtiyse kayıt "takılmış" işaretlenir; gece işi sorumluya bildirim atar |
| Sıralama | Aşama içinde elle sıralama yok — `due_at`, `amount` veya `stage_entered_at`. Kanban'da elle sıra tutmak bakım yükü, faydası düşük |
| Toplu işlem | Çoklu seçim → aşama değiştir, sorumlu ata, arşivle |
| Silme | Yok. Arşivleme var; olay geçmişi korunur |

### Aşama düzenleyici

Modül yöneticisi aşamaları yeniden adlandırabilir, sıralayabilir, ekleyebilir. **Silme yerine arşivleme**: arşiv aşamasında kayıt varsa taşıma sorulur. En az bir `active`, bir `won`, bir `lost` aşama zorunlu.

---

## 5. Modül kurulumları

### 5.1 `spd_satis_planlama_b2b_b2c` — Satış Planlama (referans)

```
titleLabel: Fırsat
uses: party(customer|lead, "Müşteri") · assignee · amount · dueAt("Beklenen kapanış")
```

| key | label | kind | SLA |
|---|---|---|---|
| `lead` | Potansiyel | active | 7 |
| `contacted` | İletişim kuruldu | active | 7 |
| `proposal` | Teklif verildi | active | 14 |
| `negotiation` | Görüşme | active | 14 |
| `won` | Kazanıldı | **won** | — |
| `lost` | Kaybedildi | **lost** | — |

Ek alanlar: `channel` (B2B/B2C), `probability` (percent), `source` (kanal: referans, web, fuar…), `notes`
Aşama şartı: `proposal` → `amount` zorunlu
Etkiler: `won` → `party_role_add: customer` + görev "Sözleşme/fatura süreci"; `lost` → `close_reason` zorunlu

### 5.2 `ik_ise_alim_oryantasyon` — İşe Alım

```
titleLabel: Aday   ·   uses: party(candidate, "Aday") · assignee
```

| key | label | kind | SLA |
|---|---|---|---|
| `applied` | Başvurdu | active | 5 |
| `screening` | Ön eleme | active | 5 |
| `interview` | Görüşme | active | 10 |
| `offer` | Teklif | active | 7 |
| `hired` | İşe alındı | **won** | — |
| `onboarding` | Oryantasyon | active | 30 |
| `rejected` | Olumsuz | **lost** | — |

> Not: `hired` işaretli `won` ama süreç bitmiyor — oryantasyon devam ediyor. Motorun `won` sonrası aktif aşamaya izin vermesi bu yüzden gerekli (bkz. §4 "Yeniden açma").

Ek alanlar: `position` (pozisyon), `source`, `expected_salary` (currency), `start_date` (date), `notes`
Etkiler: `hired` → görev "Oryantasyon paketi hazırla" + `department_members`'a ekleme önerisi; `onboarding` → kontrol listesi görevleri

### 5.3 `mid_sikayet_oneri` + `mid_teknik_destek` — Talep Yönetimi

Bu ikisi **tek modülde birleşiyor** (`talep_yonetimi`), ayrım `type` alanıyla. Gerekçe: aynı arketip, aynı aşamalar, aynı SLA mantığı; ayrı tutmak müşterinin aynı sorunu iki yerde aramasına yol açıyor.

```
titleLabel: Talep   ·   uses: party(customer) · assignee · priority · dueAt("Söz verilen tarih")
```

| key | label | kind | SLA |
|---|---|---|---|
| `open` | Açık | active | 1 |
| `in_progress` | İşlemde | active | 3 |
| `waiting` | Müşteri bekleniyor | **parked** | — |
| `resolved` | Çözüldü | **won** | — |
| `closed` | Kapandı | won | — |
| `rejected` | Kapsam dışı | **lost** | — |

Ek alanlar: `type` (şikayet / öneri / destek talebi / arıza), `channel` (e-posta, telefon, web, yerinde), `description` (longtext), `resolution` (longtext), `satisfaction` (1–5, kapanışta sorulur)
Etkiler: `open` → sorumluya bildirim; `resolved` → müşteriye bilgilendirme görevi; `parked` SLA saymaz

### 5.4 `oud_tedarik` — Tedarik

```
titleLabel: Talep   ·   uses: party(supplier, "Tedarikçi") · assignee · amount · dueAt("Beklenen teslim")
```

| key | label | kind | SLA |
|---|---|---|---|
| `requested` | Talep edildi | active | 3 |
| `quoted` | Teklif alındı | active | 5 |
| `ordered` | Sipariş verildi | active | — |
| `received` | Teslim alındı | **won** | — |
| `cancelled` | İptal | **lost** | — |

Ek alanlar: `item_id` (`entity_ref → item`, A3 geldiğinde), `item_name`, `quantity`, `unit`, `unit_price` (currency), `invoice_no`
Etkiler: `received` → **`item_movement` girişi** (A3) + `money_entry` gideri (`fm_gelir_gider`) önerisi

### 5.5 `oud_sevkiyat_yonetimi` — Sevkiyat

```
titleLabel: Sevkiyat   ·   uses: party(customer, "Alıcı") · assignee · dueAt("Teslim tarihi")
```

| key | label | kind | SLA |
|---|---|---|---|
| `preparing` | Hazırlanıyor | active | 2 |
| `shipped` | Yola çıktı | active | 7 |
| `delivered` | Teslim edildi | **won** | — |
| `returned` | İade | **lost** | — |
| `cancelled` | İptal | lost | — |

Ek alanlar: `shipment_no`, `item_summary`, `carrier`, `tracking_no`, `ship_date`
Etkiler: `shipped` → **`item_movement` çıkışı** (A3); `returned` → geri giriş

### 5.6 `oud_kalite_kontrol` — Kalite Kontrol

```
titleLabel: Kayıt   ·   uses: assignee · priority · dueAt("Kapanış hedefi")
```

| key | label | kind | SLA |
|---|---|---|---|
| `open` | Açık | active | 2 |
| `analysis` | Kök neden analizi | active | 5 |
| `action_taken` | Aksiyon alındı | active | 10 |
| `verifying` | Doğrulanıyor | active | 5 |
| `closed` | Kapandı | **won** | — |
| `rejected` | Geçersiz | **lost** | — |

Ek alanlar: `issue_type`, `severity`, `related_item`, `root_cause` (longtext), `corrective_action` (longtext), `detected_date`
Aşama şartı: `verifying` → `corrective_action` zorunlu
Etkiler: `action_taken` → doğrulama görevi; `severity = critical` → modül yöneticilerine bildirim

---

## 6. Göç

Bugün bu 7 modülün kayıtları `module_records.data` içinde, aşama bir `select` değeri.

| Adım | İş |
|---|---|
| 1 | 3 tablo + varsayılan aşama tohumlama (migration `050`) |
| 2 | Her modül için eski `status`/`stage` değeri → yeni aşama `key` eşlemesi (aşağıdaki tablo) |
| 3 | `module_records` satırları `pipeline_record`'a taşınır; `created_at` ile tek bir `pipeline_stage_event` üretilir (geçmiş yok, başlangıç var) |
| 4 | Şikayet + destek kayıtları tek modülde birleşir; `type` alanı kaynağa göre doldurulur |
| 5 | Eski satırlar `archived_at` ile kapatılır, silinmez |

Eşleme örneği: `procurement.requested → requested`, `ordered → ordered`, `received → received`; `quality.open → open`, `action_taken → action_taken`, `verifying → verifying`, `closed → closed`.

Eşlemesi olmayan değer çıkarsa kayıt ilk `active` aşamaya düşer ve `data._migration_note` ile işaretlenir — sessiz veri kaybı olmaz.

---

## 7. Bu motor bittiğinde

- 7 modül (birleşme sonrası 6) konfigürasyona düşer
- "Ne kadar süredir bu aşamada" ve huni dönüşümü ilk kez sorulabilir hale gelir
- `stageEffects` ile tedarik → depo → sevkiyat zinciri kurulur; A3 bu zincirin karşılığını bekliyor
- A6 panelleri için gerçek pipeline metrikleri doğar (dönüşüm oranı, ortalama kapanış süresi, kazanma oranı)

**Tahmini büyüklük:** 1 migration (3 tablo) · 1 servis (`moveStage` + efekt yürütücü) · 1 panel bileşeni · 6 konfigürasyon. Dört motorun en büyüğü, en çok kazandıranı — A1'den sonra buraya geçmek doğru sıra.
