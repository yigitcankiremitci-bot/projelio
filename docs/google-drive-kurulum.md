# Google Drive Entegrasyonu — Kurulum

Projelio artık Google ile giriş yapmayı ve proje dosyalarını kullanıcının kendi
Google Drive'ında saklamayı destekliyor. Bu doküman özelliği çalışır hâle
getirmek için yapılması gerekenleri anlatır.

## 1. Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) > yeni proje oluşturun.
2. **APIs & Services > Library**'den şunları etkinleştirin:
   - Google Drive API
   - Google Picker API ("Drive'dan seç" düğmesi için — bkz. §2.1)
3. **APIs & Services > OAuth consent screen**:
   - User type: **External**
   - Uygulama adı, destek e-postası, logo, gizlilik politikası ve kullanım
     şartları bağlantılarını doldurun.
   - Scope olarak yalnızca şunlar seçilir:
     `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.file`
   - **Yayın durumunu "In production" yapın.**

   > **Bu adım atlanamaz.** Onay ekranı "Testing" modundayken Google, verdiği
   > refresh token'ları **7 gün sonra iptal eder**. Kullanıcılar her hafta
   > yeniden bağlanmak zorunda kalır ve bunu hata olarak raporlar.
   >
   > İyi haber: kullandığımız `drive.file` scope'u Google tarafından
   > **non-sensitive** sayılıyor, bu yüzden restricted scope'lar için istenen
   > yıllık CASA güvenlik denetimi gerekmiyor. Yalnızca marka doğrulaması
   > (domain sahipliği + gizlilik politikası) isteniyor. Yine de birkaç iş günü
   > sürebilir — geliştirmeye başlarken başvurun.

4. **Credentials > Create Credentials > OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs — kullandığınız her ortam için ekleyin:
     - `http://localhost:3000/auth/google/callback`
     - `https://<backend-alan-adiniz>/auth/google/callback`

   Bu adresler `GOOGLE_REDIRECT_URI` ile **birebir** aynı olmalı; tek karakter
   farkı `redirect_uri_mismatch` hatası verir.

## 2. Ortam değişkenleri

`backend/.env` (üretimde Render panelinden):

```bash
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
WEB_APP_URL=http://localhost:5173
GOOGLE_TOKEN_ENC_KEY=<openssl rand -base64 32>
```

`GOOGLE_TOKEN_ENC_KEY`, refresh token'ları AES-256-GCM ile şifrelemek için
kullanılır. **Yedekleyin:** anahtar kaybolursa tüm kullanıcıların Drive
bağlantısı kopar ve herkesin yeniden bağlanması gerekir.

Değişkenler tanımlı değilse özellik sessizce kapalı kalır: "Google ile devam et"
düğmesi hiç görünmez, Ayarlar'daki Drive kartı "yapılandırılmamış" der. Mevcut
şifreli giriş etkilenmez.

### 2.1 "Drive'dan seç" (Picker) — ayrı iki değişken

Dosya **yüklemek** yukarıdaki backend değişkenleriyle çalışır. Ama Dosyalar
panelindeki **"Drive'dan seç"** düğmesi, kullanıcının kendi Drive'ında gezinmesi
için Google'ın resmi Picker widget'ını açar. Bu widget **tarayıcıda** çalışır ve
doğrudan Google'a gider — backend'e hiç uğramaz, dolayısıyla
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ona yetmez. Kendi frontend
değişkenlerini ister:

`apps/web/.env` (üretimde Netlify panelinden):

```bash
VITE_GOOGLE_PICKER_API_KEY=AIza...
VITE_GOOGLE_PICKER_APP_ID=123456789012
```

**`VITE_GOOGLE_PICKER_API_KEY` nasıl alınır**

1. **APIs & Services > Library**'den **Google Picker API**'yi etkinleştirin
   (§1'de zaten yaptıysanız atlayın).
2. **Credentials > Create Credentials > API key**.
3. Oluşan anahtarı **kısıtlayın** — kısıtlanmamış anahtar herkesin kullanımına
   açıktır ve kotanızı tüketir:
   - *Application restrictions* > **Websites**: `http://localhost:5173/*` ve
     `https://<frontend-alan-adiniz>/*`
   - *API restrictions* > **Restrict key** > yalnızca **Google Picker API**

   Bu anahtar gizli bir sır değildir (tarayıcıya gömülür); güvenliği yukarıdaki
   iki kısıtlamadan gelir.

**`VITE_GOOGLE_PICKER_APP_ID` nasıl alınır**

Google Cloud projesinin **numarası** — proje *kimliği* (`projelio-123abc`) değil,
salt rakamlardan oluşan numara. Cloud Console ana sayfasında *Project info*
kartında **Project number** olarak yazar.

Neden gerekli: kullandığımız dar `drive.file` scope'unda uygulama yalnızca kendi
oluşturduğu ya da kullanıcının açıkça seçtiği dosyalara erişebilir. "Açıkça
seçti" bilgisini Google, Picker'ı açan uygulamanın numarasıyla eşleştirir. Boş
bırakılırsa kullanıcı dosyayı seçebilir ama arkasından yapılan istek 404 döner —
sessiz ve teşhisi zor bir hata.

Anahtar tanımlı değilse düğme, ne yapılması gerektiğini söyleyen bir hata
gösterir; dosya yükleme ve diğer Drive özellikleri etkilenmez.

## 3. Veritabanı

`database/migrations/022_google_drive_files.sql` uygulanmış olmalı
(Supabase projesi `projelio` üzerinde uygulandı). Getirdikleri:

| Tablo | Ne işe yarar |
|---|---|
| `google_accounts` | Kullanıcının Google kimliği + şifreli refresh token |
| `job_storage` | **İşin** dosyalarının hangi Drive hesabında durduğu |
| `job_folders` | Proje/görev/çıktı klasörlerinin Drive ID önbelleği |
| `job_folder_grants` | Üyelere verilen Drive izinleri (geri alabilmek için) |
| `files` | Dosya metadata'sı — içerik burada değil, Drive'da |
| `file_upload_sessions` | Yarım kalan parçalı yüklemeler |

`023_files_move_to_jobs.sql` depolamayı proje düzeyinden **iş** düzeyine taşır
(`022`'deki proje tabloları hiç veri almadan değiştirildi).

Ayrıca `users.password_hash` artık nullable — Google ile gelen kullanıcıların
şifresi yok. Mevcut kullanıcılar etkilenmedi.

## 4. Nasıl çalışıyor

**Giriş.** Kullanıcı "Google ile devam et" der → Google onay ekranı → backend
`/auth/google/callback` adresine düşer → aynı e-postaya sahip bir hesap varsa
ona bağlanır, yoksa yeni kullanıcı açılır. Oturum token'ı URL'e konmaz; 2 dakika
ömürlü tek kullanımlık bir kodla takas edilir.

**Dosyalar işe aittir.** Bir işin altında birden çok proje yaşar; sözleşme,
marka kılavuzu, şartname gibi dosyalar tek bir projeye değil işe aittir. Bu
yüzden depolama **iş** düzeyindedir. Dosya bir projeye, göreve ya da çıktıya
*iliştirilebilir* ama sahibi her zaman iştir.

**Depolama sahibi.** Bir işe ilk dosya yüklendiğinde, iş sahibinin (o bağlı
değilse yükleyenin) Drive'ında şu klasör ağacı kurulur:

```
Projelio / {İş adı} / Genel                                   <- projeye bağlı olmayan dosyalar
Projelio / {İş adı} / {Proje adı} / Görevler / {Görev adı}
Projelio / {İş adı} / {Proje adı} / Çıktılar / {Çıktı adı}
```

İşin **bütün** dosyaları bu tek hesapta toplanır. Her üye kendi Drive'ına
yükleseydi, biri ekipten ayrıldığında işin dosyalarının bir kısmı erişilemez
hâle gelirdi.

**Kim neyi görür.** Projelio'nun sahiplik zinciri yukarı doğru işler:

```
Grup (holding)  >  Organizasyon  >  İş  >  Proje  >  Görev / Çıktı
```

Üst kademe, altındaki her şeyi görür:

| Kişi | Erişim |
|---|---|
| Grup sahibi / üyesi | Gruba bağlı işlerin + gruba bağlı organizasyonların işlerinin **tüm** dosyaları |
| Organizasyon sahibi / onaylı üyesi | O organizasyona bağlı işlerin tüm dosyaları |
| İş sahibi / üyesi (`job_members`) | İşin tüm dosyaları — altındaki bütün projeler dahil |
| Yalnızca bir projeye eklenmiş kişi | Sadece o projeye iliştirilmiş dosyalar. İşin geneli (`Genel` klasörü) ona kapalıdır |

Zincir **yalnızca kurulmuş bağlar üzerinden** işler. Bir işin `organization_id`
ve `group_id` alanları boşsa (serbest çalışan modu) o iş hiçbir holdinge
görünmez — sahiplik ile hiyerarşi birbirine karıştırılmaz. İşi bağlamak için
"İşi düzenle > Bağlantı" alanı kullanılır.

Grup ve organizasyon ekranlarındaki dosya listesi **salt okunurdur**: dosya her
zaman bir işe ait olmak zorunda olduğu için oradan yükleme yapılmaz. Her satırda
dosyanın hangi işten geldiği yazar.

**Paylaşım.** Drive izinleri bu tabloyu birebir yansıtır: iş ekibi ve
üstündeki kademeler işin **kök** klasöründe izin alır (dolayısıyla her şeyi
görürler), yalnızca projeye eklenmiş kişiler ise **sadece o projenin**
klasöründe. Böylece bir projeye çağrılan taşeron, Drive'da da işin diğer
projelerini göremez. Üye çıkarıldığında ya da işin organizasyon/grup bağı
değiştiğinde izinler otomatik olarak yeniden hizalanır.

Google hesabı bağlı olmayan üyeler atlanır — onlar dosyaları yine görür ve
indirir (backend proxy'si üzerinden), sadece Drive editörünü açamaz.

**Yükleme.** 8 MB altı dosyalar backend üzerinden gider. Büyük dosyalar için
backend'den bir Drive yükleme adresi alınır ve tarayıcı parçaları **doğrudan
Google'a** gönderir — içerik backend'in belleğinden geçmez, bağlantı koparsa
kaldığı yerden devam eder.

**İndirme.** `<img src>` ve `<iframe src>` Authorization başlığı gönderemediği
için, içerik uç noktası 5 dakika ömürlü ve tek dosyaya bağlı imzalı bir jeton
ister. İçerik depolama sahibinin token'ıyla Drive'dan çekilip aktarılır; yetki
Projelio'nun kendi üyelik kontrolüyle verilir.

## 5. Bilinen sınırlar

**Google Dokümanlar editörü Projelio içine gömülemez.** Google, editör
sayfalarını `X-Frame-Options: SAMEORIGIN` ile korur. Bu yüzden akış şöyle:
dosya Projelio içinde salt okunur `/preview` ile gösterilir, "Drive'da düzenle"
denince editör yeni sekmede açılır. Kullanıcı sekmeden dönünce önizleme
tazelenir. Asana, Notion ve Linear da aynı yolu izliyor.

**Kota kullanıcının.** Ücretsiz Google hesaplarında 15 GB, üstelik Gmail ve
Photos ile ortak. Ayarlar'daki Drive kartı kullanımı gösterir ve %75'i geçince
renk değiştirir; dolduğunda yükleme `storageQuotaExceeded` ile reddedilir ve
kullanıcıya anlaşılır bir mesaj döner.

**Drive tek yönlü doğruluk kaynağı değil.** Kullanıcı Drive'a girip dosyayı
silebilir. Projelio bunu anlık öğrenmez; dosyaya erişilmeye çalışıldığında 404
alınırsa kayıt `missing` işaretlenir ve listede kırmızı görünür. Gerçek zamanlı
senkron için ileride Drive Changes API eklenebilir.

**Program görevlerinde dosya yok.** Program (operations) görevlerinin projesi
olmadığı için görev modalinde dosya bölümü gösterilmez. İşin `Genel` klasörünü
kullanabilirsiniz.

**Silme Drive'a dokunmaz.** Projelio'dan "Kaldır" dosyayı yalnızca listeden
çıkarır (`archived_at`). Kullanıcının kendi depolamasındaki veriyi bir tıklamayla
yok etmek doğru olmaz. API `?trash=1` ile çöp kutusuna taşımayı destekler —
kalıcı silme hiç yapılmaz.

**Devir akışı henüz yok.** Depolama sahibi ekipten ayrılırsa işin dosyaları
erişilemez hâle gelir. Sonraki adımların en önemlisi bu: yeni sahip seçme ve
Drive'da klasör sahipliğini aktarma akışı.

## 6. Modül sınırı notu

`FilesModule`, `GoogleModule`'ü **değil** `GoogleCoreModule`'ü içeri alır.
Sebep: `GoogleModule` "Google ile giriş" için `UsersModule`'e bağımlı ve şu
döngü doğuyordu:

```
JobsModule > FilesModule > GoogleModule > UsersModule > OrganizationsModule > JobsModule
```

Dosya yükleyip indirmek için kullanıcı kimliğine gerek yok — sadece token ve
Drive API gerekiyor. `GoogleCoreModule` tam olarak o kadarını verir. Files
tarafına Google bağımlılığı eklerken bu ayrımı bozmayın.

## 7. Sonraki adımlar

- [ ] Depolama sahibi devretme akışı (**öncelikli**)
- [ ] Google Picker ile "Drive'ımdan mevcut dosyayı ekle"
- [ ] Drive Changes API ile ad değişikliği/silme senkronu
- [ ] Yorumlara dosya eki (`task_comments`, `post_comments`)
- [ ] Program (operations) seviyesinde dosya
- [ ] Mobil uygulamada dosya paneli
