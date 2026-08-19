# Modül Sözleşmesi — Sosyal Medya

> `pd_sosyal_medya`. **Kendi tablolarına yazan ilk plan modülü.**
>
> Migration: `054_social_media.sql` · Panel: `SocialMediaPanel.tsx` · Servis: `backend/src/modules/social-media/`

---

## 1. Kimlik

| | |
|---|---|
| key | `pd_sosyal_medya` |
| Ad | Sosyal Medya |
| Departman | Pazarlama ve Büyüme |
| Arketip | **A5 — Takvim / Plan** (motoru bu modülde yazıldı) |
| Kapsam | organization (+department), job (freelancer) |
| Freelancer'a uygun | Evet |
| Çekirdek mi | Hayır |
| UI yüzeyi | Tam sayfa · üç görünüm (Takvim / Akış / Hesaplar) |
| Veri | `social_accounts`, `social_posts`, `social_post_targets`, `social_post_media` |
| `module_records` kullanır mı | **Hayır** |

---

## 2. Amaç

> Sosyal medya yöneticisi kanallarını, içerik takvimini ve içeriklerin metin/görsel hazırlığını tek yerde tutar; "bu hafta ne çıkıyor, hangi kanal boş kalmış, hangi içerik onay bekliyor" sorusu takvime bakınca cevaplanır.

**Bu modül şu değildir:** reklam bütçesi yönetimi (o `pd_reklam`), e-posta kampanyası (o `pd_email`), içerik performans analizi (o `pd_dijital_pazarlama` paneli).

---

## 3. Neden kendi tabloları

Modül önceden `module_records` üzerinde "platform + başlık + tarih + durum" olan bir kayıt defteriydi. Sosyal medya yöneticisinin günlük işi bunun dışında kalıyordu:

| İhtiyaç | `module_records` ile neden olmuyordu |
|---|---|
| Birden çok hesabı ayrı ayrı yönetmek | Hesap bir kayıt türü değil; her gönderide platform adını elle yazmak gerekiyordu |
| Aynı içeriği birden çok kanalda yayımlamak | Çoğa çok ilişki; jsonb dizisi sorgulanamaz, referans bütünlüğü kurulamaz |
| Kanala göre değişen metin | Ortak metin + hesap başına ezme, iki seviyeli veri |
| Görsel/video iliştirmek | `files` tablosuna sıralı referans gerekiyor |

`uyd_urunler` (products) ve `crm_musteri` (party) ile aynı gerekçe: **veri modelin kendisiyse, jsonb'de yaşamaz.**

---

## 4. Veri

### 4.1 `social_accounts` — kanal kimliği

Hesap yalnızca `@kullaniciadi` değil: `audience_note` (kitle), `tone_note` (marka sesi), `posting_frequency` (ritim), `owner_user_id` (sorumlu) ve `color` (takvim rengi) burada. Sebep pratik — içerik yazan kişi çoğu zaman hesabı açan kişi değildir; "bu hesapta nasıl konuşuyoruz" bilgisi yazılı olmazsa her devirde yeniden keşfediliyor.

Sahiplik `module_records` ile aynı ikili desen: `organization_id` **ya da** `job_id` (tam olarak biri).

### 4.2 `social_posts` — içerik

| Alan | Not |
|---|---|
| `title` | **İç** başlık; takvimde görünen kısa ad, yayımlanan metin değil |
| `caption` | Yayımlanacak açıklama metni |
| `hashtags` | Serbest metin; sayaç bunu da karaktere katar |
| `first_comment` | Etiketleri gövdeden ayırıp ilk yoruma taşıma düzeni yaygın |
| `link_url`, `campaign`, `content_type` | |
| `scheduled_at` | Saatli — yayın saati önemli |
| `status` | `idea → draft → ready → approved → scheduled → published` (+ `failed`, `cancelled`) |
| `reach`, `engagement`, `clicks`, `result_note` | Yayın sonrası ölçüm |

Akışın tamamı zorunlu değil: iki kişilik ekip `draft → published` gider. Onay adımları (`ready`, `approved`) müşteri onayı olan ajanslarda anlamlı; listede var, dayatılmıyor.

### 4.3 `social_post_targets` — içerik × hesap

Kanala özel metin (`caption_override`, boşsa ortak metin) ve **kanal bazında yayın sonucu** (`external_post_id`, `external_url`, `error_message`). Üç hesaptan biri hata verdiğinde gönderinin tamamı "başarısız" sayılmamalı.

Hedef listesi güncellenirken satırlar silinip yeniden yazılmaz: yayımlanmış bir hedefin dış gönderi kimliği vardır, silinirse "bu içerik nerede yayımlandı" bilgisi kaybolur. Yalnızca listeden çıkanlar silinir.

### 4.4 `social_post_media` — görsel/video

Dosyanın kendisi Projelio'nun mevcut dosya altyapısında (Drive/OneDrive, `files` tablosu) durur; burada yalnızca **hangi dosya, hangi sırayla, hangi alt metinle** tutulur. Böylece görsel ikinci bir yere kopyalanmaz ve dosya ekranındaki izin/paylaşım düzeni aynen geçerli kalır.

Medya iliştirmek gönderinin var olmasını gerektirir; composer yeni içerikte ilk yüklemede kaydı taslak olarak açar. Alternatifi (dosyayı geçici bir yere koyup kaydederken taşımak) yarım kalan yüklemelerde sahipsiz dosya bırakıyordu.

---

## 5. Ekran

| Görünüm | Ne için |
|---|---|
| **Takvim** | Ay ızgarası (pazartesi başlangıçlı, sabit 42 hücre). Kart sürüklenerek başka güne taşınır — saat korunur. Çift tıklama o güne yeni içerik açar. Altta "tarihsiz fikirler" havuzu: takvime çıkmamış içerik kaybolmaz |
| **Akış** | Durum sütunlu pano; toplu gözden geçirme ve onay |
| **Hesaplar** | Kanal kartları: kitle, ton, ritim, sorumlu, içerik sayısı |

Composer'da karakter sayacı **seçili kanalların en darına** göre uyarır (X 280, Pinterest/Threads 500, Instagram/TikTok 2200, LinkedIn 3000…). "Yapıştırırken kesildi" hatası eskiden ancak yayından sonra fark ediliyordu.

---

## 6. Yetki

Değişiklik yok, mevcut sıra geçerli: **organizasyon sahibi > departman yöneticisi > modül üyesi** — karar `ModuleMembersService.resolveOrganizationAccess` / `resolveJobAccess` içinde, `SocialMediaService` yalnızca sonucu sorar.

Diğer modül tablolarıyla aynı güvenlik modeli: RLS açık, politika yok; erişim yalnızca `service_role` üzerinden, yani yalnızca servis katmanından.

---

## 7. Otomatik paylaşım — Instagram ✅

**Uygulandı.** Kurulum, jeton yaşam döngüsü, yayın akışı ve sınırlar ayrı bir notta:
[14-instagram-entegrasyonu.md](14-instagram-entegrasyonu.md)

Özet: Business Login for Instagram ile bağlanılır, medya yayın anında geçici bir public kovaya kopyalanır (Meta medyayı kendi sunucusundan çeker), konteyner + `media_publish` ile yayımlanır. Zamanlanmış içerikler 5 dakikada bir dönen kuyrukla kendiliğinden çıkar.

Aşağıdaki alanlar 054'te bu iş için ayrılmıştı ve şimdi kullanılıyor:

- `social_accounts`: `connection_status` (`manual` | `connected` | `expired` | `revoked`), `external_account_id`, `token_expires_at`, `last_synced_at` — 058 bunlara `provider` ve `connection_error` ekledi
- `social_post_targets`: `external_post_id`, `external_url`, `error_message`, `attempted_at`, `published_at` — 058 kuyruk için `publish_at`, `attempt_count`, `next_attempt_at`, `container_id` ekledi

Yani tahmin tuttu: şemanın gövdesi değişmedi, yalnızca kuyruğun ihtiyacı olan alanlar eklendi.

> **Jeton uyarısı:** 054'teki `access_token_ref` kolonu **kullanılmıyor**. Jetonlar 058 ile gelen ayrı ve şifreli `social_account_tokens` tablosunda; o tabloyu yalnızca `SocialTokensService` okur.

`manual` bir arıza değil, geçerli bir çalışma biçimi: bağlantı kurmayan kullanıcı için Projelio planı ve metni tutar, yayını kullanıcı yapar. Arayüzde bu yüzden nötr renkte gösterilir.

---

## 8. Sıradaki adımlar

1. **Tekrar kuralı** — "her Salı 19:00" (A5 motorunun `plan_routine` tarafı); bu modül referans alınabilir
2. **Görev üretimi** — içerik sorumlusuna çekirdek görev düşmesi, `task_id` alanı hazır
3. **Onay bildirimi** — `ready` → modül yöneticisine bildirim
4. **Insights senkronu** — yayımlanan gönderinin erişim/etkileşim sayılarının otomatik gelmesi
5. **Diğer platformlar** — LinkedIn, X: `SocialPublishService` platformdan bağımsız yazıldı, bir `switch` kazanır
6. **`pd_email` ile ortak takvim** — `docs/moduller/22-motor-a5-takvim.md §5.1` birleşmeyi öneriyor; sosyal medya kendi motorunu aldığına göre e-posta bu modele `channel` olarak katılabilir
