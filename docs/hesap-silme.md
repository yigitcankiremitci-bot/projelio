# Hesap silme — mevcut durum ve tasarım notu

> Bu belge 2026-08-23 tarihli güvenlik geçişinde yazıldı. Tasarım kararı **verildi**
> (bkz. "Verilen karar"), kod **henüz yazılmadı**.

## Mevcut durum: hesap silme YOK

Kod tabanında hesap silen ya da kapatan hiçbir uç yok. `users.controller.ts` ve
`auth.controller.ts` içinde `@Delete` yok; `deleteAccount`, `anonymize` gibi bir
servis metodu da yok. Ne sert (hard) ne yumuşak (soft) silme var — hiç yok.

Buna karşılık **gizlilik politikası bunu vaat ediyor** (`apps/web/src/lib/legal/privacyPolicy.ts`):

- *"Hesabınızı sildiğinizde … veriler en geç 30 gün içinde kalıcı olarak silinir"*
- *"Çoğu talebi kendiniz karşılayabilirsiniz: … **hesabınızı silme talebi oluşturabilirsiniz**"*
- KVKK m.11 ve GDPR kapsamında silme (erasure) ve taşınabilirlik (portability) hakları

Yani metin, üründe olmayan bir yeteneği anlatıyor. Bu hem KVKK/GDPR açısından bir
uyum boşluğu, hem de kullanıcıya yanlış bilgi.

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

## Bu belge yazılana kadar yapılmayanlar

- Kod yazılmadı. Silme, yanlış yapıldığında geri alınamayan tek işlem; şemadaki
  cascade tuzağı görülmeden yazılsaydı ekip verisi yok edilebilirdi.
- Gizlilik politikası metni de değiştirilmedi — hukuki metni ürün kararı
  netleşmeden düzenlemek doğru olmaz.
