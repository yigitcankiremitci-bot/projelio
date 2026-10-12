# @projelio.app posta kutuları — kurulum

E-posta modülüne (`pd_email`) Outlook'un yanına üçüncü bir kutu türü eklendi:
**ad@projelio.app**. Adresi yalnızca Projelio yöneticisi (admin rolü) açar ve
kapatır. Kutu bir modül kapsamına bağlanır (şirket/departman ya da iş);
modüle atanmış herkes okur, yanıtlar, yeni e-posta yazar.

Kod: `backend/src/modules/mailbox/projelio-posta*.ts`, arayüz
`apps/web/src/components/MailboxPanel.tsx` + `ProjelioYeniEpostaModal.tsx`,
şema `database/migrations/162_projelio_posta_kutulari.sql`.

## Nasıl çalışıyor

```
Gönderen ──► MX: Google Workspace (projelio.app)
               │  Google Admin yönlendirme kuralı:
               │  tanınmayan @projelio.app alıcısı → zarf alıcısı Resend'e
               ▼
             Resend Inbound (<id>.resend.app)
               │  webhook  email.received  (Svix imzalı)
               ▼
             POST https://api.projelio.app/mail/inbound/resend
               │  gövde + ekler Resend API'sinden çekilir,
               │  To/Cc/teslim başlıklarındaki adres kutuyla eşlenir
               ▼
             mail_messages + mail-ekleri kovası ──► modül ekibine bildirim

Giden: Projelio ──► Resend /emails (from: "Görünen Ad <ad@projelio.app>")
```

MX Google'da kalıyor: `info@` gibi gerçek Workspace kutuları bozulmasın diye.
Google yalnızca **tanımadığı** alıcıları Resend'e yönlendiriyor; yani
Workspace'te kullanıcısı/takma adı olan bir adres Projelio'da kutu olarak
açılsa bile postası Google'da kalır. (`info`, `destek`, `bildirim`, `admin` vb.
zaten ayrılmış ad — bkz. `AYRILMIS_ADLAR`.)

## Kurulum adımları (bir kez)

### 1. Resend — gelen posta

1. Resend panelinde **Receiving** bölümünü aç; hesaba ait gelen adresi not et:
   `<herhangi-bir-şey>@<id>.resend.app`.
2. **Webhooks → Add endpoint** (2026-10-12'de kuruldu, kimlik `88be98b3-…`):
   - URL: `https://api.projelio.app/mail/inbound/resend`
   - Olay: `email.received`
3. Uç noktanın **Signing secret**'ını (`whsec_...`) kopyala.

### 2. Sunucu — ortam değişkeni (2026-10-12'de eklendi)

Canlıda `/srv/projelio/deploy/.env` (compose `env_file`; `backend/.env` DEĞİL —
o yalnızca yerel geliştirme). Değer backend yeniden oluşturulunca okunur:

```
RESEND_INBOUND_WEBHOOK_SECRET=whsec_...
# İsteğe bağlı, test kopyası için: PROJELIO_MAIL_DOMAIN=projelio.app
```

`RESEND_API_KEY` zaten tanımlı olmalı (gönderim onunla). Tanımsız sır = her
gelen posta 401 ile reddedilir (imzasız uç herkesin sahte posta yazması demek).

### 3. Google Admin — yönlendirme

projelio.app, PistStudio Workspace'inde İKİNCİL alan adı; aynı hesapta
piststudio.com, budnal.app, farkindayim.tr, rundeer.app da var. Kural bu yüzden
"tüm alıcılar" değil, yalnızca `@projelio.app` alıcıları için kurulur — yoksa
diğer alan adlarının tanınmayan postası da Resend'e akar.

Admin konsolu → **Uygulamalar → Google Workspace → Gmail → Yönlendirme** →
*Yönlendirme* bölümünde **Başka bir kural ekle** (kuruluş birimi: PistStudio):

- Açıklama: `Projelio posta kutulari -> Resend Inbound`
- Etkilenecek iletiler: **Gelen** + **Dahili - Alma**
- Hesap türleri: yalnızca **Etkin olmayan ve tanınmayan tüm hesaplar**
  (Etkin kullanıcı hesapları İŞARETSİZ — gerçek Workspace kutuları bozulmasın)
- Üstbilgiler: **X-Gm-Original-To üstbilgisi ekle** (gizli kopyayla gelen
  postada asıl alıcıyı bu başlık söylüyor; kod buna bakıyor)
- Zarf alıcısı → **Alıcıyı değiştir**: `projelio@aereluequo.resend.app`
- Seçenekleri göster → Zarf filtresi → **Yalnızca belirli zarf alıcıları** →
  *Kalıp eşleşmesi*: `(?i)@projelio\.app$`
- Spam filtresini atlama İŞARETSİZ (Google'ın spam filtresi önde kalsın)

Resend'in hesap adresi: `<herhangi>@aereluequo.resend.app` (Resend → Emails → Receiving).
Değişikliğin yayılması birkaç dakika–1 saat sürebilir.

### 4. Migration

```bash
./deploy/migrate.sh uygula   # 162_projelio_posta_kutulari.sql
```

### 5. Deneme

1. Admin hesabıyla bir şirketin E-posta modülüne gir → Gelen kutusu →
   **+ @projelio.app adresi** → `deneme` oluştur.
2. Gmail'den `deneme@projelio.app`'e yaz → bir dakika içinde kutuda görünmeli
   (liste dakikada bir yoklanıyor; **Yenile** hemen getirir).
3. Kutudan **Yeni e-posta** ile kişisel adresine yaz → Gönderilenler'de görünür.

Gelmiyorsa sırayla: Resend panelinde Receiving → posta Resend'e ulaştı mı?
Webhooks → teslim denemesi 2xx mi? Backend log'unda `Gelen posta için kutu
yok` / `İmzası geçersiz` satırı var mı?

## Bilinçli kararlar

- **Kalıcı silme yok.** Çöp kutusu bir klasör; kutu ortak olduğu için bir
  kişinin "sil"i ekibin postasını yok etmesin.
- **Hiçbir kutuya uymayan posta sessizce düşer**, geri dönüş (bounce)
  üretilmez — spam'cilerin sahte adreslerine bounce göndermek kara listeye sokar.
- **DMARC'ı açıkça düşen posta İstenmeyen'e** gider; geri alınabilir.
- **Günlük gönderim tavanı kutu başına 300.** Ele geçirilmiş bir hesabın
  projelio.app'in gönderici itibarını yakmasının önündeki son engel.
- **Ek tavanı toplam 25 MB** (gelen ve giden). Tavanı aşan gelen ek kaydedilmez,
  iletide adıyla "indirilemez" görünür.
- Gidende kendi Message-ID'imizi YAZMIYORUZ (Resend koyuyor); yanıtlarda
  karşı tarafın kimliğiyle `In-Reply-To` + `References` kurulur.
