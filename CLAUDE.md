# Projelio — Claude çalışma rehberi

npm workspaces monorepo. Genel tanıtım ve kurulum için `README.md`'ye bak — burada
yalnızca koda bakarak çıkarılamayacak şeyler var.

## Nerede ne var

Dosya ararken önce buraya bak; `grep`/`find` ile taramadan önce doğru klasöre git.

| Ne | Nerede |
|---|---|
| Backend iş mantığı | `backend/src/modules/<modül>/<modül>.service.ts` |
| Backend HTTP uçları | `backend/src/modules/<modül>/<modül>.controller.ts` |
| Veritabanı erişimi | `backend/src/database/supabase.service.ts` (ORM yok) |
| Yetki/erişim kuralları | `backend/src/common/access/`, `backend/src/common/guards/` |
| Web sayfaları (route) | `apps/web/src/pages/` |
| Web bileşenleri | `apps/web/src/components/` |
| Web yardımcıları / hook'lar | `apps/web/src/lib/` |
| HTTP istemcisi, hata tipi, oturum | `apps/web/src/api/client.ts` |
| Web+mobil+backend ortak tipler | `packages/shared/src/types.ts` |
| SQL migration'lar | `database/migrations/NNN_ad.sql` |
| Geri alma betikleri | `database/geri-al/` — migrations'ın DIŞINDA, bilerek |
| Dağıtım/yedek/migration betikleri | `deploy/` |
| API referansı | `docs/api-endpoints.md` (seçilmiş uçlar) + `node scripts/uc-listesi.mjs` (tam liste) |
| Modül sistemi tasarımı | `docs/moduller/` — 20 belge; README'de faz tablosu |
| Tanıtım sitesi (Next.js) | `landing/` |
| WhatsApp köprüsü (WAHA yan-servisi + modül) | `backend/src/modules/whatsapp/`, `deploy/docker-compose.prod.yml` `waha` servisi, tasarım `docs/whatsapp-qr-plan.md` |

Backend'de 46 modül, 450'den fazla HTTP ucu var (`node scripts/uc-listesi.mjs` ile
listelenir — elle yazılmış liste bayatlıyor). Lio =
`modules/ai-assistant/`; araç tanımları `ai-assistant.tools.ts`, kredi sistemi
`ai-credits.service.ts` + `ai-credits.config.ts`.

`apps/mobile` (Expo) neredeyse boş — asıl istemci `apps/web`.

`landing/` = Next.js tanıtım sitesi (projelio.app). Bu repoda ama npm
workspace'i DEĞİL: kendi `package.json` ve `package-lock.json`'ı var, kök
`npm install` ona dokunmaz. Vercel'de ayrı bir proje olarak, Root Directory
`landing` verilerek yayımlanır.

Kardeş klasör `../projelio-whatsapp` ayrı bir projedir, bu repoya dahil değil.

## Komutlar

```bash
npm run dev          # backend + web birlikte (concurrently)
npm test             # tüm testler
npm test -- --filter=access   # yalnızca eşleşen testler
npm run typecheck    # backend + web tsc --noEmit
npm run yayinla      # kontrol et + onay al + push'la + yayını izle
```

## Yayın nasıl oluyor (yerelde çalış, sonra yayınla)

**Canlıya çıkmanın tek yolu main'in origin'e push'lanmasıdır.** Dosya kaydetmek,
commit atmak, dal açmak canlıya hiçbir şey göndermez — istediğin kadar birikir.

Push'landıktan sonra zincir kendi işler: GitHub Actions `ci.yml` koşar → VPS'teki
`projelio-deploy.timer` dakikada bir bakar, **yalnızca CI'ı yeşil olan** commit'i
alır, imajları derleyip `docker compose up -d` yapar.

Kritik ayrıntı: **CI kırmızıysa hiçbir yerde hata görünmez**, zamanlayıcı
sessizce hiçbir şey yapmaz ve canlı eski hâlinde kalır. Bu yüzden push'u
doğrudan atmak yerine `npm run yayinla` (bkz. `deploy/yayinla.sh`) kullan:
commit'lenmemiş dosya var mı bakar, CI'ın koşacağı typecheck + testleri yerelde
koşar, ne gideceğini gösterip onay ister, sonra CI ve dağıtımı izler.

Migration'lar bu zincire DAHİL DEĞİL — hâlâ elle uygulanıyor (bkz. aşağıda).

**⚠️ Tailscale anahtarı 2027-02-25'te doluyor.** Sunucuya SSH yalnızca tailnet
üzerinden (`projelio@100.111.242.24`) yapılıyor; 22 numaralı port genel IP'de
kapalı. Anahtar yenilenmezse erişim tamamen kopar ve geriye yalnızca sağlayıcı
konsolu kalır. Kalıcı çözüm: Tailscale panelinden bu makineye *"Disable key
expiry"* işaretlemek (altyapı düğümleri için önerilen yol).

Sunucuda **root yok**: `projelio` kullanıcısı sudoers'da değil ve yerel anahtar
root girişini açmıyor. Bu yüzden sunucuda kurulan her şey (ör. yedekleme)
kullanıcı crontab'ıyla kuruluyor, systemd birimiyle değil — birimler repoda
duruyor ama root erişimi olduğu gün işe yarar. Bkz. `deploy/yedekle.sh` başlığı.

### Sunucuda elle kurulması gerekenler (kod tarafı hazır, ayar bekliyor)

Bunlar repoda var ama **ortam değişkeni tanımlanana kadar sessizce kapalı**:

| Ne | Değişken | Nerede tanımlanır |
|---|---|---|
| Yedeğin dış kopyası | `PROJELIO_UZAK_HEDEF` | crontab / `~/uyari.env` |
| Arıza bildirimi | `PROJELIO_NTFY_KONU` ya da `PROJELIO_TELEGRAM_TOKEN`+`_CHAT` | `/etc/projelio/uyari.env` ya da `~/uyari.env` |
| Yedek yaşam sinyali | `PROJELIO_YEDEK_PING` | aynı dosya |
| WhatsApp'tan Lio'ya komut | `WHATSAPP_LIO_KOMUT=1` | `backend/.env` |

`WHATSAPP_LIO_KOMUT` açıkken kullanıcının bağlı telefonundan yazdığı serbest
metin Lio'nun araçlı akışına giriyor (bkz. `docs/whatsapp-lio-komut-plani.md`).
Kapalıyken o metin sessizce düşer — WhatsApp yalnızca bildirim kanalı olarak
çalışmaya devam eder. Saatlik istek tavanı `WHATSAPP_LIO_SAATLIK` (varsayılan
10), gelen metin uzunluğu `WHATSAPP_LIO_MAX_UZUNLUK` (varsayılan 1000).

Kurulum adımları `deploy/yedekle.sh` ve `deploy/uyar.sh` başlıklarında yazılı.
Dış kopya kurulana kadar yedekler **yalnızca korumaya çalıştıkları diskte**
duruyor. Ayrıca dışarıdan bir uptime izleyicisi `https://api.projelio.app/health/ready`
adresine bakmalı — `/health` yalnızca sürecin ayakta olduğunu söyler,
veritabanı ölüyken bile 200 döner.

Değişiklik sonrası **her zaman `npm run typecheck` çalıştır.** Tüm test setini
değil, dokunduğun alanın testlerini `--filter` ile koştur.

## Bu repoda geçerli konvansiyonlar

- **ORM yok.** Veri erişimi Supabase JS client üzerinden, `supabase.service.ts`
  ile. Entity/repository aramaya kalkma, yok.
- **Test koşucusu Node'un yerleşiği** (`node --test`), vitest/jest yok ve
  eklenmeyecek. Test dosyaları kaynağın yanında: `taskFocus.ts` →
  `taskFocus.test.ts`. Yeni bağımlılık eklemeden yaz.
- **ESLint/Prettier yok.** Mevcut dosyanın stilini taklit et, formatlayıcı çalıştırma.
- **Yorumlar Türkçe ve "neden"i anlatır.** Bir davranışın nedenini açıklayan uzun
  yorumları silme — çoğu geçmişte yaşanmış bir hatayı belgeliyor. Yeni yorumları
  aynı dilde ve aynı üslupta yaz.
- **Kullanıcıya görünen tüm metinler Türkçe.**
- **Renkler tek yerden gelir:** `packages/shared/src/theme.ts` — açık ve koyu tema
  paletleri orada tanımlı (`accent: #C0813F`, ana `#3E4858`). Yeni renk uydurma,
  bileşene sabit hex yazma; paletten al.

## Dikkat edilecekler

- **Migration numaraları çakışabiliyor** — `019`, `027`, `043`, `044`, `051`,
  `058`, `060`, `063` iki kez kullanılmış (hepsi farklı tablolara dokunduğu için
  zararsız). Yeni migration eklerken `ls database/migrations | tail` ile en
  yüksek numarayı gör ve bir sonrakini al.
- **Geri alma (rollback) betikleri `database/geri-al/` altında**, migrations
  içinde DEĞİL. Aynı numarayı taşıyorlardı ve sıralı toplu uygulamada ileri
  migration'ı hemen ardından geri alıyorlardı (bkz. `database/geri-al/README.md`).
- **Migration'lar kendi VPS'imizdeki Postgres'e elle uygulanıyor** (Supabase'e
  değil — 2026-08-30'da göç edildi). Dosyayı yazmak yeterli değil; uygulanması
  gerektiğini bana hatırlat. Tercih edilen yol `deploy/migrate.sh`:

  ```bash
  ./deploy/migrate.sh durum     # bekleyenleri listeler
  ./deploy/migrate.sh uygula    # sırayla uygular, kaydeder, PostgREST'i tazeler
  ```

  Betik `schema_migrations` tablosunu (migration 083) kullanır: uygulanmışları
  atlar, her dosyayı tek transaction'da çalıştırır, sonradan değiştirilmiş
  dosyaları yakalar. **İlk kurulumda** önce 083'ü elle uygula, sonra
  `./deploy/migrate.sh isaretle` ile mevcut 82 dosyayı "uygulanmış" say.

  Elle uygulamak gerekirse:
  `ssh projelio@100.111.242.24 'docker exec -i projelio-postgres sh -c "psql -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d \$POSTGRES_DB"' < database/migrations/NNN_ad.sql`
  (tailnet adresi; genel IP'de 22 kapalı). Şema değiştiyse PostgREST'in
  önbelleğini tazele: `docker exec projelio-postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -c \"notify pgrst, 'reload schema'\""`
- **`client.ts` içindeki oturum sonlanma mantığına dokunma.** 401'lerin tek
  merkezden yönetilmesi bilinçli; oraya `catch` eklemek "her şeyim silinmiş"
  hatasını geri getirir.
- **Bildirim gönderirken `notifyUserSafe` kullan**, `notifyUser` değil.
  `notifyUser` veritabanı hatasında `throw` ediyor; beklenmeden bırakılırsa
  Node 22 yakalanmamış promise reddinde SÜRECİ ÖLDÜRÜR. Sonucu gerçekten
  beklemen gerekmiyorsa (ki bildirimlerde neredeyse hiç gerekmez) güvenli olanı
  çağır. `main.ts`'te güvenlik ağı var ama oraya düşen her kayıt bir eksik
  catch demektir.
- **Dış servise giden her `fetch` zaman aşımlı olmalı** —
  `common/http/fetch-with-timeout.ts`. Node'un fetch'inde yanıt için varsayılan
  zaman aşımı YOK; asılı kalan bir istek kuyruk işleyicisini (`running` bayrağı)
  süresiz kilitleyebiliyor. Veritabanı çağrıları için aynı koruma
  `backend/src/database/retrying-fetch.ts` içinde zaten var.
- **Liste uçlarına tavan koy** — `common/liste-tavani.ts`. Kod tabanında gerçek
  sayfalama yok; tavan, veri beklenmedik biçimde büyüdüğünde kopmayı önlüyor.
- **Büyük dosyalar** — bunları tamamen okumaya çalışma, ilgili bölümü hedefle:
  `files.service.ts` (~1900), `planning.service.ts` (~1600),
  `TaskColumn.tsx` (~1500), `ai-assistant.service.ts` (~1300),
  `tasks.service.ts` (~1250).
- `.env` dosyaları repoda mevcut ve gerçek anahtar içeriyor. İçeriğini yazdırma,
  paylaşma, commit'e ekleme.

## Yeni backend modülü eklemek

1. `backend/src/modules/<ad>/` altında `<ad>.module.ts`, `<ad>.controller.ts`,
   `<ad>.service.ts` oluştur — komşu bir modülü örnek al. (`dto/` klasörü yalnızca
   3 modülde var, varsayılan değil.)
2. `backend/src/app.module.ts` içine kaydet.
3. Şema değişiyorsa `database/migrations/` altına yeni numaralı SQL ekle.
4. Ortak tip gerekiyorsa `packages/shared/src/types.ts`'e koy, kopyalama.
5. Web tarafında çağrıyı `apps/web/src/api/` altına ekle.
6. `npm run typecheck` + ilgili testler.

## Benimle çalışırken (bağlam/token disiplini)

- Görev dar tanımlıysa keşif yapma; doğrudan dosyayı aç ve düzenle.
- Geniş araştırma gerekiyorsa **subagent kullan**, dosya dökümü ana bağlama girmesin.
- Bir dosyayı bir kez oku, tekrar okuma. Değişiklikleri tam dosya yeniden yazmak
  yerine hedefli düzenleme ile yap.
- Test/build çıktısını tam dökme; başarısız olan kısmı göster.
- Basit işlerde plan modu ve uzun muhakeme gerekmiyor — doğrudan yap.

## Compact talimatları

Özetlerken şunları koru: değiştirilen dosyaların tam listesi, çalıştırılan
komutlar ve sonuçları, henüz uygulanmamış migration'lar, kullanıcının reddettiği
yaklaşımlar.
