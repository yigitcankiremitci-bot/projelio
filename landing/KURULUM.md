# Projelio Web Sitesi — Kurulum ve Yayınlama

Bu klasör, Projelio'nun tanıtım sitesidir. Next.js 15 + React 19 ile yazıldı,
üçüncü parti UI kütüphanesi kullanılmadı — tüm tasarım `src/app/globals.css`
içindeki tek dosyada.

İçerik Türkçe ve İngilizce: `/tr/...` ve `/en/...`. Dil öneki olmayan adresler
tarayıcı diline göre otomatik yönlendirilir.

---

## 1. Bilgisayarınızda çalıştırın (5 dakika)

Terminali açın ve şunları yazın:

```bash
cd projelio/landing   # ana deponun icinde
npm install
npm run dev
```

Tarayıcıda **http://localhost:3000** adresini açın. Değişiklik yaptığınız anda
sayfa kendini yeniler.

> Node.js kurulu değilse: https://nodejs.org adresinden **LTS** sürümünü kurun.

Yayına almadan önce üretim derlemesini bir kez deneyin — hata varsa burada görürsünüz:

```bash
npm run build
npm run start
```

---

## 2. Yayına almadan önce doldurulacaklar

Aşağıdakiler bilerek boş/örnek bırakıldı. Hepsi tek tek işaretlenmiş durumda:

| Nerede | Ne yapmalı |
|---|---|
| `src/lib/site.ts` | `url` (GoDaddy'den aldığınız alan adı), `appUrl` (panel adresi), sosyal medya, `company` altındaki unvan / vergi dairesi / MERSİS bilgileri |
| `src/i18n/tr.ts` → `pricing` | **Fiyatlar örnektir.** Paket adlarını, TL tutarları ve paket içeriklerini kendi modelinize göre değiştirin |
| `src/i18n/tr.ts` → `credits.packs` ve `credits.usage` | Kredi paketleri ve kredi tüketim tablosu — gerçek maliyetlerinize göre güncelleyin |
| `src/i18n/en.ts` | Aynı değişiklikleri İngilizce tarafta da yapın (aynı yapıda) |
| `src/i18n/legal.ts` | 5 yasal metnin taslağı hazır. **Bir hukukçuya okutmadan yayınlamayın.** Sayfalarda şu an uyarı kutusu görünüyor; metinler onaylanınca `src/app/[lang]/legal/[slug]/page.tsx` içindeki `alert alert-err` bloğunu silin |
| `public/og.png` | Sosyal medya paylaşım görseli hazır; alan adınız değişirse yenileyin |

### Gerçek ekran görüntüleri

Şu an ekran görüntüleri kodla çizilmiş temsillerdir
(`src/components/MockScreens.tsx`). Uygulamanın gerçek görüntülerini aldığınızda:

1. PNG'leri `public/screens/` klasörüne koyun (örn. `panel.png`, `kanban.png`).
2. `src/app/[lang]/screenshots/page.tsx` ve `src/app/[lang]/page.tsx` içindeki
   `<MockScreen ... />` satırını şununla değiştirin:
   ```tsx
   <Image src="/screens/panel.png" alt={shot.title} width={1200} height={800} />
   ```

Gerçek görüntüler dönüşüm oranını belirgin şekilde yükseltir — ilk fırsatta yapın.

---

## 3. GitHub

Site artık ayrı bir depo değil — ana `projelio` deposunun içinde `landing/`
klasörü olarak duruyor. Ayrıca `git init` yapmayın; normal akışta commit'leyip
push'lamanız yeterli:

```bash
cd projelio
git add landing
git commit -m "Tanıtım sitesi: ..."
git push
```

> Kök `npm install` landing'e dokunmaz — `landing/` bilerek npm workspace'i
> değil, kendi `package-lock.json`'ı ile bağımsız kurulur.

---

## 4. Vercel'e bağlayın (ücretsiz)

1. https://vercel.com → **Continue with GitHub** ile giriş yapın.
2. **Add New… → Project** → `projelio` deposunu **Import** edin.
3. **Root Directory** olarak `landing` seçin. **Bu adım zorunlu:** boş
   bırakılırsa Vercel depo kökünde Next.js arar, bulamaz ve derleme başarısız
   olur.
4. Framework otomatik **Next.js** algılanır — geri kalan ayarları
   değiştirmeyin, **Deploy**.
5. 1–2 dakika içinde `.vercel.app` adresinde yayında olur.

> Site zaten Vercel'de yayındaysa yeni proje açmayın: mevcut `projelio-site`
> projesinde **Settings → General → Root Directory**'yi `landing` yapın ve
> **Settings → Git**'ten depoyu `projelio` ile değiştirin.

### Ortam değişkenleri

**Settings → Environment Variables** altına `.env.example` dosyasındaki
anahtarları girin (en azından `NEXT_PUBLIC_SITE_URL`). Ekledikten sonra
**Deployments → … → Redeploy** ile yeniden yayınlayın.

---

## 5. GoDaddy alan adını bağlayın

Vercel'de: **Project → Settings → Domains → Add**, alan adınızı yazın
(hem `projelio.app` hem `www.projelio.app` ekleyin). Vercel size hangi kaydı
gireceğinizi gösterecek. İki yol var:

### Yol A — Sadece DNS kaydı (önerilen, e-postanız bozulmaz)

GoDaddy → **My Products → Domains → DNS → Manage Zones**:

| Tip | Ad | Değer | TTL |
|---|---|---|---|
| A | `@` | **Vercel'in domain kartında gösterdiği IP** (genelde `76.76.21.21`) | 600 |
| CNAME | `www` | `cname.vercel-dns.com` | 600 |

> Vercel yeni projelere anycast havuzundan farklı IP'ler verebiliyor
> (örn. `216.198.79.1`). **Her zaman Vercel ekranındaki değeri kullanın**,
> buradaki örneği değil.

Varsayılan olarak GoDaddy'nin eklediği `@` ve `www` "Parked" kayıtlarını silin.

### Yol B — Nameserver devri (tüm DNS'i Vercel yönetir)

GoDaddy → **Domain Settings → Nameservers → Change → I'll use my own**:

```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Bu yolu seçerseniz **e-posta (MX) kayıtlarınızı Vercel tarafında yeniden
tanımlamayı unutmayın**, yoksa alan adınıza gelen e-postalar durur.

### Sonrası

DNS yayılması genelde 10–60 dakika (bazen 24 saat) sürer. Vercel alan adının
yanında yeşil tik gösterdiğinde SSL sertifikası otomatik kurulmuş demektir.
`https://` zorunlu yönlendirme de otomatiktir.

Bittiğinde `src/lib/site.ts` içindeki `url` alanını ve Vercel'deki
`NEXT_PUBLIC_SITE_URL` değerini gerçek alan adıyla güncelleyin.

---

## 6. İletişim formunun e-posta göndermesi

Form şu an çalışıyor ama e-posta göndermiyor (mesajı sunucu loguna yazıyor).
Aktifleştirmek için:

1. https://resend.com → ücretsiz hesap açın (ayda 3.000 e-posta ücretsiz).
2. **API Keys → Create** → anahtarı kopyalayın.
3. Vercel → Environment Variables:
   - `RESEND_API_KEY` = `re_...`
   - `CONTACT_TO` = `info@projelio.app`
4. Redeploy edin.

Gönderen adresin `merhaba@projelio.app` gibi görünmesi için Resend'de
**Domains** sekmesinden alan adınızı doğrulayıp `CONTACT_FROM` değerini
güncelleyin.

---

## 7. Ödeme altyapısı (iyzico / PayTR)

Ödeme alma işlemi **bu sitede değil, uygulamanın panelinde** olmalı — site
sadece "Ücretsiz başla" ile panele yönlendiriyor. Yine de başvuru sürecinde
ödeme kuruluşları aşağıdaki sayfaları sitenizde arar; hepsi hazır:

- Mesafeli Satış Sözleşmesi → `/tr/legal/distance`
- İptal ve İade Koşulları → `/tr/legal/refund`
- Gizlilik Politikası → `/tr/legal/privacy`
- KVKK Aydınlatma Metni → `/tr/legal/kvkk`
- Kullanım Koşulları → `/tr/legal/terms`
- İletişim bilgileri ve açık şirket unvanı → altbilgi + `/tr/contact`

Başvuru öncesi `src/lib/site.ts` içindeki `company` bilgilerini gerçek
değerlerle doldurun; iyzico ve PayTR bu bilgilerin sitede görünür olmasını
istiyor. Şahıs şirketi ya da limited şirket kaydı ve vergi levhası da gerekir.

---

## 8. Yayın sonrası kontrol listesi

- [ ] Google Search Console'a alan adını ekleyip `https://projelio.app/sitemap.xml` gönderin
- [ ] Ana sayfada Lio demosunu telefondan test edin
- [ ] İletişim formundan kendinize test mesajı gönderin
- [ ] Paylaşım görselini test edin: https://www.opengraph.xyz
- [ ] Hız ve erişilebilirlik testi: Chrome → sağ tık → İncele → Lighthouse
- [ ] Analitik ekleyin (Vercel Analytics tek tıkla açılır, ya da Google Analytics)

---

## Dosya haritası

```
src/
├── app/
│   ├── [lang]/
│   │   ├── layout.tsx          Ortak iskelet, SEO etiketleri, JSON-LD
│   │   ├── page.tsx            Anasayfa (hero + Lio demo + 8 bölüm)
│   │   ├── pricing/            Fiyatlandırma
│   │   ├── credits/            Kredi paketleri + hesaplayıcı
│   │   ├── screenshots/        Ekran görüntüleri
│   │   ├── faq/                S.S.S. (arama motorları için JSON-LD)
│   │   ├── contact/            İletişim formu
│   │   └── legal/[slug]/       5 yasal metin
│   ├── api/contact/route.ts    Form gönderimi (Resend)
│   ├── globals.css             Tüm tasarım sistemi
│   ├── sitemap.ts robots.ts manifest.ts
├── components/                 Header, Footer, LioDemo, fiyat tabloları…
├── i18n/
│   ├── tr.ts  en.ts            SİTEDEKİ TÜM METİNLER burada
│   ├── legal.ts                Yasal metin taslakları
│   └── index.ts
├── lib/site.ts                 Alan adı, iletişim, şirket bilgileri
└── middleware.ts               Dil yönlendirmesi
```

**Metin değiştirmek için kod bilmenize gerek yok:** `src/i18n/tr.ts` dosyasını
açın, tırnak içindeki yazıları değiştirin, kaydedin. Site kendini yeniler.
