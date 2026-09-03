# Projelio — Codex çalışma rehberi

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
| API referansı | `docs/api-endpoints.md` |
| Tanıtım sitesi (Next.js) | `landing/` |

Backend'de 42 modül var (`backend/src/modules/` altında listelenir). Lio =
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

Sunucuda **root yok**: `projelio` kullanıcısı sudoers'da değil ve yerel anahtar
root girişini açmıyor. Bu yüzden sunucuda kurulan her şey (ör. yedekleme)
kullanıcı crontab'ıyla kuruluyor, systemd birimiyle değil — birimler repoda
duruyor ama root erişimi olduğu gün işe yarar. Bkz. `deploy/yedekle.sh` başlığı.

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

- **Migration numaraları çakışabiliyor** — `060`, `062`, `063` iki kez kullanılmış.
  Yeni migration eklerken `ls database/migrations | tail` ile en yüksek numarayı
  gör ve bir sonrakini al.
- **Migration'lar kendi VPS'imizdeki Postgres'e elle uygulanıyor** (Supabase'e
  değil — 2026-08-30'da göç edildi). Dosyayı yazmak yeterli değil; uygulanması
  gerektiğini bana hatırlat. Komut:
  `ssh projelio@100.111.242.24 'docker exec -i projelio-postgres sh -c "psql -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d \$POSTGRES_DB"' < database/migrations/NNN_ad.sql`
  (tailnet adresi; genel IP'de 22 kapalı). Şema değiştiyse PostgREST'in
  önbelleğini tazele: `docker exec projelio-postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -c \"notify pgrst, 'reload schema'\""`
- **`client.ts` içindeki oturum sonlanma mantığına dokunma.** 401'lerin tek
  merkezden yönetilmesi bilinçli; oraya `catch` eklemek "her şeyim silinmiş"
  hatasını geri getirir.
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
