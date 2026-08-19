# E-posta Modülü — Gelen Kutusu (Outlook)

> `pd_email` modülünün ikinci yüzeyi: gelen postayı okuma ve yanıtlama.
>
> Migration: `064_mail_accounts.sql` · Kod: `backend/src/modules/mailbox/` · Panel: `MailboxPanel.tsx`

---

## 1. Neden Outlook, neden Gmail değil

Teknik olarak ikisi de aynı zorlukta. Ayrım maliyette:

| | Microsoft Graph ✅ | Gmail API |
|---|---|---|
| İzinler | `Mail.ReadWrite`, `Mail.Send` (delegated) | `gmail.readonly`, `gmail.send`, `gmail.modify` |
| İzin sınıfı | Normal delegated | **Restricted scope** |
| Yıllık denetim | Yok | **CASA Tier 2** — bağımsız denetçi, 12 ayda bir yenileme |
| Maliyet | Yayıncı doğrulaması (ücretsiz) | Lab taramasında birkaç yüz dolardan başlar, kapsam büyüdükçe on binlere çıkar — her yıl |

Projede Drive için `drive.file` scope'u tam da CASA'yı tetiklememek için seçilmişti (bkz. `google-oauth.service.ts`). Gmail eklemek o kararı bozar; bu yüzden **önce Outlook**. Gmail, CASA bütçesi netleştiğinde aynı iskelete eklenir: `GraphMailService`'in bir eşi yazılır, `MailboxService` değişmez.

IMAP'e kaçış yok — Gmail IMAP da XOAUTH2 üzerinden aynı restricted scope'u istiyor.

---

## 2. Kurulum

**Yeni bir Azure uygulaması gerekmez.** OneDrive için kullandığınız uygulamaya iki ekleme yapılır:

1. **API permissions** → Microsoft Graph → **Delegated** → `Mail.ReadWrite`, `Mail.Send`
2. **Authentication** → Redirect URIs → `https://<backend>/mail/microsoft/callback`

```bash
MICROSOFT_MAIL_REDIRECT_URI=https://<backend>/mail/microsoft/callback
```

> **Neden ayrı bir dönüş adresi:** depolama ve posta akışlarının geri dönüşü farklı controller'lara düşüyor. Tek adres kullanılsaydı `MicrosoftModule` ile `MailboxModule` birbirini içe aktarmak zorunda kalır, döngüsel bağımlılık doğardı. İki URI de Azure'da kayıtlı olmalı.

> **Posta bağlarken OneDrive izni İSTENMİYOR** (`MAIL_SCOPES` içinde depolama scope'u yok). Sebebi ince ama önemli: istenirse, depolaması Google Drive olan bir kullanıcı posta bağladığı anda "OneDrive hazır" durumuna düşer ve depolama sağlayıcısı sessizce değişmiş gibi görünürdü.

---

## 3. Kutu kime ait — ortak kutu modeli

Kutu bir **kişiye** değil **modüle** bağlanır:

```
Kullanıcı A "info@sirket.com" kutusunu Pazarlama modülüne bağlar
        ↓
Modüle atanmış herkes o kutuyu okur ve o kutudan yanıtlar
        ↓
Okuma/yazma, A'nın Microsoft bağlantısı üzerinden yapılır
```

Departman e-postası kurumsaldır: `info@`, `satis@`, `destek@` kutusuna bakan kişi izinli bir çalışandır, kutunun sahibi değildir. Herkesin yalnızca kendi kutusunu gördüğü bir model "departman gelen kutusu" fikrini ortadan kaldırırdı.

**Bedeli açıkça söyleniyor:** bağlama ekranında "bağladığınız kutuyu bu modüle atanmış herkes okuyabilir" yazıyor, `connected_by` kimin açtığını kalıcı kaydediyor ve kutu seçicinin yanında "ekip erişebilir" notu duruyor.

**Paylaşılan kutu:** bağlarken adres girilirse (`info@sirket.com`) Graph'ta `/users/{adres}` yolu kullanılır. Bunun için bağlayan kişinin Exchange tarafında o kutuda **tam erişim** yetkisi olmalı; yoksa Graph 403 döner ve kullanıcıya "tam erişim yetkisi gerekiyor olabilir" denir.

### Yetki: okumak da yazma yetkisi ister

Alışılmadık ama kasıtlı. Modülü *görebilen* (departman üyesi ama modüle atanmamış) biri kayıt listesini görebilir — ama bir e-posta kutusunun içi kayıt listesi değildir: müşteri yazışması, özlük konusu, sözleşme pazarlığı olabilir. Kutuya yalnızca modüle **atanmış** kişiler girer.

---

## 4. İletiler saklanmıyor

`mail_accounts` tablosu yalnızca **bağlantıyı** tutar. İleti, ek, adres — hiçbiri Projelio'ya kopyalanmaz; her istek canlı olarak Graph'a gider.

Gerekçe: e-posta içeriğini kopyalamak, veriyi Projelio'nun sorumluluğuna taşımak demektir — KVKK kapsamı, saklama süresi, silme talebi, sızıntı yüzeyi. Kopyalamadığımızda kullanıcı Outlook'tan bir postayı sildiğinde Projelio'da da yok olur; beklenen davranış budur.

**Bedeli:** her tıklama ağ gecikmesi taşır. Arayüz bu yüzden yükleme durumlarını gizlemiyor.

Jeton da bu tabloda değil: mevcut `microsoft_accounts.refresh_token_enc` kullanılıyor (AES-256-GCM, `MICROSOFT_TOKEN_ENC_KEY`).

---

## 5. Ekran

**İki sütun + modal:** solda klasörler ve ileti listesi, bir iletiye tıklayınca okuma ve yanıt **modalde** açılıyor (`MailMessageModal`).

İlk tasarım üç sütunluydu (klasörler · liste · okuma). Modül sayfasının içinde üçüncü sütun hem gövde hem yazma alanı için dardı: yanıt kutusu sekiz satırlık bir delikti ve uzun bir e-posta yazmak eziyetti. **E-posta yazmak odaklanılan bir iştir, kenar çubuğu işi değil** — modal ekranın tamamına yakınını kullanıyor, kapatınca liste yerinde duruyor.

Yazma alanının kuralları:

- Taban yükseklik 260px ve **içerik uzadıkça kendi büyür** (`scrollHeight`); sabit `rows` uzun yanıtta kaydırma çubuğuna mahkûm ediyordu
- Okuma alanı ekran yüksekliğinin oranı (`62vh`, taban 380px) — sabit piksel 13" dizüstünde makulken 27" ekranda modalın yarısını boş bırakıyordu
- Yanıt açılınca gövde `28vh`'ye küçülür: odak yazmaya geçer ama alıntı görünür kalır
- Yazılmış metin varken modal kapatılmak istenirse onay sorulur — Escape'e basmak yazılan yanıtı sessizce çöpe atıyordu
- Yanıtla / Tümünü yanıtla / İlet üçü de Graph'ın kendi eylemleriyle; alıntılama, `RE:`/`FW:` başlığı ve konuşma zinciri Outlook'un kurallarıyla kuruluyor

Listede kutuda arama (bütün klasörlerde), okundu işareti ve açılmakta olan iletinin göstergesi var. Kampanya kayıtları ikinci sekmede duruyor — veri modelleri örtüşmediği için ayrı, ama aynı modülde.

**Gövde sandbox'lı iframe'de gösteriliyor.** Gelen e-posta güvenilmeyen HTML'dir; doğrudan sayfaya koymak gönderene script çalıştırma imkânı verirdi.

---

## 6. Lio: taslak yazar, göndermez

"Lio ile taslak" düğmesi gelen iletiyi ve —varsa— kullanıcının yazdığı niyet notunu ("fiyat veremem, önce toplantı isteyelim") modele verir, dönen metni yanıt kutusuna koyar. Gönderme her zaman insanın eylemi.

Otomatik gönderilen bir e-posta geri alınamaz ve yanlış cümle şirketin adına kurulmuş olur. Bu yüzden akışta insan onayı **zorunlu bir halka**, bir kolaylık değil.

Modele giden bağlam bilinçli olarak dar: yalnızca açık olan iletinin metni (ilk 6.000 karakter), konusu ve göndereni. Kutunun tamamı ya da başka müşterilerin yazışmaları gönderilmiyor. Sistem promptu modele "bilmediğin tarihi/fiyatı uydurma, `[ ]` içinde yer tutucu bırak" diyor.

Kredi muhasebesi normal Lio kullanımıyla aynı: `AiAssistantService.draftText` bakiyeyi önden kontrol eder, token'ları sonunda ücretlendirir.

---

## 7. Bu turda olmayanlar

| Eksik | Neden |
|---|---|
| Ek indirme/gönderme | Ekler listede görünüyor ama indirme Outlook'a bırakıldı; dosya akışını Projelio'nun dosya alanına bağlamak ayrı bir tur |
| Yeni e-posta yazma (yanıt değil) | Gelen kutusu turu; sıfırdan yazma bir sonraki adım |
| E-postayı göreve/müşteriye bağlama | `party` eşlemesi ve görev üretimi ayrı tur |
| Gmail | CASA bütçesi kararı (§1) |
| Toplu gönderim / mail listeleri | **Bu modülden yapılmamalı** — §8 |

---

## 8. Toplu gönderim neden burada değil

Gelen kutusu ile mailing list gönderimi farklı boru hatlarıdır ve ikincisi Outlook/Gmail hesabı üzerinden yapılmaz:

- **Kota:** Outlook ~10.000 alıcı/gün ve dakikada 30 ileti; Gmail 500 (Workspace 2.000). 5.000 kişilik bir liste tek seferde çıkmaz.
- **Teslimat:** kişisel bir kutudan toplu pazarlama maili atmak spam klasörüne düşmenin ve hesabın askıya alınmasının en kısa yolu.
- **Hukuk:** Türkiye'de ticari elektronik ileti için İYS kaydı, onay yönetimi ve abonelikten çıkma bağlantısı zorunlu. Bunlar bir "gönder" düğmesinden fazlası — izin durumu, ret listesi, geri dönen adresler.

Doğrusu: bir ESP (Resend/Brevo/SendGrid/Mailgun) + kendi alan adıyla SPF/DKIM/DMARC. Kişi listeleri zaten `party` tablosunda; segmentler oradan beslenecek. Sağlayıcı seçimi bilerek ertelendi, kod adaptör deseniyle yazılacak.
