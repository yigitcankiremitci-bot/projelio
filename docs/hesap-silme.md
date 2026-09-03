# Hesap silme — tasarım ve uygulama

> **DURUM: uygulandı ve canlıda.** Bu belge 2026-08-23'te bir tasarım notu olarak
> yazıldı; aşağıdaki tasarım o zamandan beri koda geçti. Aşağıdaki gerekçeler
> (cascade tuzağı, veri kategorileri) hâlâ geçerli ve kodun *neden* böyle
> yazıldığını açıklıyor — bu yüzden korunuyor.

## Bugün ne var

| Ne | Nerede |
|---|---|
| Silme talebi | `DELETE /users/me` — `users.controller.ts` |
| Silinecekleri önizleme | `GET /users/me/deletion-preview` |
| Veri dışa aktarma (taşınabilirlik) | `GET /users/me/export` |
| İş mantığı | `account-deletion.service.ts`, kuralları `account-deletion.rules.ts` |
| Şema | migration `070_hesap_silme.sql` (`users.deleted_at`) |
| Testler | `account-deletion.rules.test.ts` |

**İki aşamalı silme (belgede özgün olarak yoktu, sonradan eklendi):** "Sil" demek
hemen silmiyor. Talep alınınca yalnızca `deleted_at` damgalanıyor ve hesap
kullanılamaz hâle geliyor; kalıcı silme `GRACE_PERIOD_DAYS = 30` gün sonra,
`account-purge.processor.ts` (günlük `@Cron`) tarafından yapılıyor. Bu süre
içinde hesap **geri alınabiliyor** (`deleted_at: null`).

Bekleme süresi gizlilik politikasındaki "en geç 30 gün içinde kalıcı olarak
silinir" vaadiyle bilerek aynı tutuldu.

## Neden bu kadar dikkatli yazıldı

Aşağıdaki bölümler, "sadece bir DELETE ekle" yaklaşımının neden çalışmadığını
anlatıyor. Silme kodunu değiştirecek olan önce bunları okumalı — özellikle
başkalarının verisini silme riski (`ON DELETE CASCADE` zincirleri).

## Neden "sadece bir DELETE ekle" olmuyor

Bugün `delete from users where id = ...` çalıştırılsa iki şeyden biri olur ve
ikisi de kötü.

### 1. Sorgu hata verir

Altı yabancı anahtar silme davranışı belirtmeden tanımlanmış (`no action`), yani
bağlı kayıt varken silmeyi **engeller**:

| Tablo / sütun | Not |
|---|---|
| `budget_transactions.user_id` | 001 |
| `operations.owner_id` | 021 |
| `operation_tasks.user_id` | 021 — **not null** |
| `operation_routines.default_assignee` | 021 |
| `files.uploaded_by` | 022 — **not null** |
| `files.uploaded_by` (iş bazlı şema) | 023 — **not null** |

`not null` olanlarda `set null`'a çevirmek de mümkün değil; o satırların ya
silinmesi ya da başka bir kimliğe devredilmesi gerekir.

### 2. Ya da daha kötüsü: başkalarının verisi silinir

`projects.owner_id` ve `jobs.owner_id` **`on delete cascade`**. Yani bir kullanıcı
silindiğinde:

```
users (1 satır)
  └─ projects (sahibi olduğu TÜM projeler)
       └─ görevler, dosya kayıtları, bütçe işlemleri, paylaşımlar, yorumlar…
  └─ jobs (sahibi olduğu TÜM işler)
       └─ aynı şekilde her şey
```

Bu bir ekip aracı: o projelerde **başka insanların** haftalarca çalışmış olduğu
veri var. "Hesabımı sil" diyen bir kişi, farkında olmadan ekibinin işini yok
edebilirdi. Toplamda `users(id)`'ye 66 yabancı anahtar bakıyor — 36'sı cascade,
30'u set null.

## Politikanın kendisi doğru tasarımı zaten söylüyor

Gizlilik politikası şunu yazıyor:

> *"Hesabınızı silseniz de organizasyonun sahibi olduğu içerik (ör. ekip
> arkadaşlarınıza gönderdiğiniz yorumlar, tamamladığınız görev kayıtları)
> organizasyonda kalmaya devam eder."*

Yani hedeflenen davranış **cascade silme değil, kişisel veriyi silip organizasyon
verisini anonimleştirerek bırakmak**. Doğru yaklaşım da bu. Ama şemadaki cascade
kuralları bunun tam tersini yapıyor — yani şema ile politika çelişiyor.

## Önerilen tasarım

Üç kategori:

**A. Gerçekten silinecek (kişisel, kimseyi ilgilendirmeyen)**
`push_subscriptions`, `personal_todos`, `personal_task_prefs`, `ai_conversations`
ve mesajları, `notifications`, `google_accounts` / `microsoft_accounts` (bağlı
bulut hesapları ve şifrelenmiş jetonları), `password_reset_tokens`,
`email_verification_tokens`, `ai_credit_balances`.

**B. Anonimleştirilecek (organizasyonun işine ait, ama kimliği taşımamalı)**
`users` satırı silinmez; kimlik alanları temizlenir:

```
full_name  -> 'Silinmiş kullanıcı'
email      -> 'silinmis+<id>@projelio.invalid'   (unique kısıtı korunur)
username   -> 'silinmis_<kısa id>'
password_hash, avatar_url, title, bio -> null
deleted_at -> now()
```

Böylece görev geçmişi, yorumlar, bütçe kayıtları ve dosya sahiplikleri
bozulmadan kalır; 66 yabancı anahtarın hiçbiri kırılmaz. Giriş, `deleted_at`
dolu hesaplar için reddedilir.

**C. Devredilecek (sahiplik)**
Kullanıcının sahibi olduğu `projects` / `jobs` / `operations`:
- Organizasyona bağlıysa → organizasyon sahibine devredilir.
- Bağlı değilse (serbest çalışan) → kişisel veri sayılır, silinebilir.

Bu, `on delete cascade` kurallarına hiç dokunmadan çalışır: kullanıcı satırı
zaten silinmediği için cascade tetiklenmez. Cascade'leri değiştiren riskli bir
migration'a gerek kalmaz — sadece `users` tablosuna `deleted_at` eklenir.

### Gereken migration

```sql
alter table public.users add column if not exists deleted_at timestamp;
create index if not exists idx_users_deleted_at on public.users(deleted_at);
```

Tek satırlık, geri alınabilir, mevcut veriye dokunmuyor.

### Ek olarak: veri dışa aktarma (taşınabilirlik)

GDPR Art. 20 ve politikadaki *"yapılandırılmış ve makine tarafından okunabilir
biçimde alma"* vaadi için ayrı bir uç gerekir (`GET /users/me/export`). Silmeden
bağımsız, salt okunur, risksiz — ama kapsamı eksik olursa "verinizin tamamını
verdik" demek yanlış olur, o yüzden hangi tabloların dahil olduğu açıkça
yazılmalı.

## Verilen karar (2026-08-23)

**Silinen kullanıcının sahibi olduğu, organizasyona bağlı OLMAYAN projeler ve
işler için kural: "içinde başka üye yoksa sil, varsa devret."**

Yani C kategorisi (sahiplik) şöyle işleyecek:

| Sahip olunan şey | Durum | Yapılacak |
|---|---|---|
| İş | Başka onaylı üye yok | Gerçekten silinir (kişisel veri) |
| İş | Başka onaylı üye var | Anonim sahiplikte kalır; üyelerin erişimi kesilmez |
| Organizasyon / grup | İçinde senden başka kimse yok | Hesapla birlikte silinir |
| Organizasyon / grup | İçinde başka onaylı kişi var | **Silme engellenir**, önce devredilmeli |

> Şema notu: `jobs` tablosunda `organization_id` YOK — işler doğrudan kullanıcıya
> ait, organizasyonlar ayrı bir yapı. İlk tasarımdaki "organizasyona bağlıysa
> devret" dalı bu yüzden hiç oluşmuyor.
>
> Organizasyon/grup için ilk sürüm HER DURUMDA engelliyordu; ama tek kişilik bir
> şirkette devredilecek kimse olmadığı için kullanıcı hesabını hiç silemiyordu.
> Kural işlerdekiyle aynı hale getirildi. "Başka kişi" sayımı departman kadrosu
> (`department_members`) ve ortaklar (`partners`) üzerinden, yalnızca `approved`
> kayıtlarla yapılıyor.

Gerekçe: tek kişilik projeler gerçekten silinerek politikadaki *"kalıcı olarak
silinir"* ifadesi karşılanıyor; içinde başkalarının emeği olan projeler ise
korunuyor. Bir ekip aracında "hesabımı sildim, ekibimin işi gitti" sürprizi
kabul edilemez.

Uygulama notu: üye kontrolü `project_members` / `job_members` üzerinden
`status = 'approved'` ve `user_id <> silinen` koşuluyla yapılmalı. Davet
aşamasında kalmış (`invited`/`pending`) kayıtlar "başka üye var" saymaz.

## Sonradan eklenen: bekleme süresi

Özgün tasarımda yoktu, uygulama sırasında eklendi: silme talebi anında
kalıcılaşmıyor, 30 gün `deleted_at` damgasıyla bekliyor ve geri alınabiliyor.

Gerekçe kodda yazılı (`account-deletion.service.ts`): hesap silme çoğu zaman
anlık bir kararla veriliyor ve geri alınamıyor. Bekleme süresi hem kullanıcıya
dönüş yolu bırakıyor hem de ele geçirilmiş bir hesapta saldırganın veriyi tek
tıkla yok etmesini engelliyor.

Kalıcı silmeyi `account-purge.processor.ts` günlük olarak yapıyor.
