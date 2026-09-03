# Yedekleme

Bu belge Projelio verisinin nerede durduğunu, neyin yedeklendiğini ve neyin
**yedeklenmediğini** anlatır. En önemli kısmı son bölüm: yedek almak yetmez,
geri yüklemeyi bir kez denemiş olmak gerekir.

## Veri nerede duruyor

| Ne | Nerede | Yedeği kim alıyor |
|---|---|---|
| Tüm uygulama verisi (kullanıcı, proje, görev, bütçe, mesaj…) | Supabase Postgres | **Supabase planı** — aşağıya bak |
| Avatar ve kapak görselleri | Supabase Storage kovaları | **Kimse.** Postgres yedeğine DAHİL DEĞİL |
| Kullanıcı dosyaları (Drive/OneDrive) | Kullanıcının kendi bulut hesabı | Kullanıcının sağlayıcısı |
| Kod | Git | Git remote |
| Sırlar (`JWT_SECRET`, `GOOGLE_TOKEN_ENC_KEY`…) | Render paneli | **Kimse.** Elle yedeklenmeli |

## 1. Veritabanı — asıl iş Supabase panelinde

Otomatik veritabanı yedeği **kodla değil, Supabase planıyla** açılır. Kontrol
edilecek yer: Supabase > Project Settings > **Database** > Backups.

- **Free plan:** otomatik yedek **yok**. Veri kaybı durumunda geri dönüş yok.
- **Pro plan:** günlük otomatik yedek, 7 gün saklama.
- **PITR (Point-in-Time Recovery):** ayrı ek — dakika hassasiyetinde geri dönüş.

> Yapılacak ilk şey bu sayfaya bakıp planın ne sağladığını görmek. Bu belgedeki
> her şey onun tamamlayıcısıdır, yerine geçmez.

### Elle / zamanlanabilir yedek

Plandan bağımsız olarak kendi kopyanı almak için:

```bash
SUPABASE_DB_URL='postgresql://...' ./scripts/yedek-al.sh
```

Bağlantı dizesi: Supabase > Project Settings > Database > Connection string >
**URI** (havuzlayıcı "pooler" değil, doğrudan bağlantı — `pg_dump` havuzlayıcıyla
çalışmaz).

Script `pg_dump` gerektirir:

```bash
brew install libpq && brew link --force libpq
```

Çıktı `yedek/` klasörüne yazılır. **Bu klasör `.gitignore`'da** — dosya
veritabanının tamamını içeriyor (şifre hash'leri, şifrelenmiş Drive jetonları),
asla commit edilmemeli.

### Otomatiğe bağlamak

Script kendi kendine çalışmaz. Seçenekler, uygunluk sırasıyla:

1. **Supabase Pro planı** — en doğrusu. Yedek Supabase'in altyapısında durur,
   bizim tarafta hiçbir şey çalıştırmak gerekmez.
2. **Kendi bilgisayarında zamanlanmış görev** (macOS `launchd`, Linux `cron`) —
   bilgisayar açıkken çalışır. Küçük ekipler için makul, ama "bilgisayar kapalıydı"
   riskini taşır.
3. **Render Cron Job** — `render.yaml`'a `type: cron` bir servis eklenebilir. ÖNEMLİ:
   Render'ın diski geçicidir, yedek orada kalmaz; script'in çıktıyı bir nesne
   deposuna (S3, Backblaze B2) yüklemesi gerekir. Yani bu seçenek ek altyapı ve
   yeni bir sır demektir.

> Uygulama içindeki `@Cron` işleri (bkz. `backend/src/modules/*/*.processor.ts`)
> bu iş için **kullanılmamalı**: web servisinin diski geçici, ve veritabanı yedeği
> alan bir süreç isteklere cevap veren süreçle aynı yerde olmamalı.

## 2. Supabase Storage kovaları — en sık atlanan yer

Avatar ve kapak görselleri Postgres'te değil, ayrı nesne deposunda. Koddaki tam
liste (`grep -rn 'BUCKET = "' backend/src` ile doğrulanabilir):

| Kova | İçerik |
|---|---|
| `avatars` | Kullanıcı profil görselleri |
| `job-covers` | İş kapakları |
| `project-covers` | Proje **ve operasyon** kapakları (ikisi aynı kovayı kullanıyor) |
| `organization-covers` | Organizasyon kapakları |
| `department-covers` | Departman kapakları |
| `group-covers` | Grup kapakları |
| `product-covers` | Ürün kapakları |
| `social-publish` | Instagram'a gönderim için geçici public medya |

**Veritabanı yedeği bunları içermez.** Veritabanını geri yüklersen kayıtlar
kalır ama görseller kırık gelir.

Supabase CLI ile indirilebilir:

```bash
supabase storage download --recursive ss://avatars ./yedek/kovalar/avatars
```

Bu görseller kritik değil (kaybı can yakmaz, kullanıcı yeniden yükler), o yüzden
sıklığı düşük tutulabilir. `social-publish` zaten geçici, hiç yedeklenmesi
gerekmiyor. Ama "yedeğim var" derken neyin kapsam dışı olduğunu bilmek gerekir.

## 3. Sırlar — kaybı geri dönüşü olmayan tek şey

Render panelindeki ortam değişkenleri hiçbir yedeğe dahil değil. İkisi özellikle
kritik:

- **`GOOGLE_TOKEN_ENC_KEY`** — kullanıcıların Drive yenileme jetonları bununla
  şifreleniyor. **Kaybolursa veritabanı yedeği bile işe yaramaz**: tüm Drive
  bağlantıları kopar ve her kullanıcının yeniden bağlanması gerekir.
- **`JWT_SECRET`** — kaybı daha hafif: herkesin oturumu kapanır, yeniden giriş
  yaparlar.

Bunları bir parola yöneticisinde sakla. Bir metin dosyasında ya da bu depoda değil.

## 4. Geri yükleme

Geri yükleme denenmemiş bir yedek, yedek sayılmaz. Boş bir Supabase projesi (ya da
yerel Postgres) açıp şunu çalıştır:

```bash
gunzip -c yedek/projelio_2026-08-23_120000.sql.gz | psql "$HEDEF_DB_URL"
```

Sonra kontrol et: kullanıcı sayısı doğru mu, bir projenin görevleri geliyor mu,
giriş yapılabiliyor mu.

**Yılda en az bir kez** bu tatbikatı yap. Gerçekten ihtiyaç duyduğun gün öğrenmek
istemeyeceğin şeyler burada ortaya çıkar.

## 5. Kontrol listesi

- [ ] Supabase planının otomatik yedek sağlayıp sağlamadığı kontrol edildi
- [ ] `GOOGLE_TOKEN_ENC_KEY` ve `JWT_SECRET` parola yöneticisinde
- [ ] En az bir kez elle yedek alındı ve boyutu makul
- [ ] Geri yükleme bir kez denendi
- [ ] Storage kovalarının kapsam dışı olduğu biliniyor

## WhatsApp oturum veritabanları

WAHA (WhatsApp köprüsü) oturum anahtarlarını ana veritabanında değil, `waha`
ile başlayan ayrı veritabanlarında tutar. `deploy/yedekle.sh` bunları 1b
adımında ayrıca döker (`waha_*-<damga>.dump`). Kaybı ölümcül değildir: numara
yönetici panelinden QR ile yeniden bağlanır; mesaj geçmişi ve atamalar ana
veritabanındadır. Ayrıntı: `docs/moduller/16-whatsapp.md` §3.

