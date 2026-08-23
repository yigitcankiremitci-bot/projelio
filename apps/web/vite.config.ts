import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * VITE_API_URL derleme anında paketin içine gömülür — çalışma anında
 * değiştirilemez. Yanlışsa uygulama yayına çıkar ve HİÇBİR isteği başarılı olmaz.
 *
 * İki hata biçimi var, ikisi de sessiz:
 *   * Değişken hiç tanımlanmamış: client.ts "http://localhost:3000"a düşer, yani
 *     canlı site kullanıcının kendi bilgisayarına istek atar.
 *   * http:// bir adrese ayarlı: site https'ten servis edildiği için tarayıcı
 *     karışık içerik (mixed content) kuralıyla isteği engeller.
 *
 * CI/Netlify derlemesinde hata veriyoruz — bozuk bir paketin yayına çıkmasındansa
 * derlemenin durması iyidir; Netlify başarısız derlemede önceki sürümü yayında
 * tutar. Yerelde yalnızca uyarı, üstelik http://localhost sorun sayılmaz:
 * geliştirici prod derlemesini yerel backend'e bakarak denemek isteyebilir.
 *
 * loadEnv kullanılıyor çünkü .env dosyalarındaki değerler process.env'e DÜŞMEZ;
 * process.env'e bakmak yereldeki doğru yapılandırmayı görmeyip boşuna uyarırdı.
 * loadEnv hem .env dosyalarını hem de gerçek ortam değişkenlerini (Netlify böyle
 * verir) birlikte okur.
 */
function assertApiUrl(mode: string, apiUrl: string | undefined): void {
  if (mode !== "production") return;

  const otomatikOrtam = Boolean(process.env.NETLIFY || process.env.CI);
  const deger = apiUrl?.trim();
  const yerelAdres = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$|\/)/.test(deger ?? "");

  let sorun: string | null = null;
  if (!deger) {
    sorun = "VITE_API_URL tanımlı değil; uygulama http://localhost:3000 adresine istek atar.";
  } else if (yerelAdres && otomatikOrtam) {
    sorun = `VITE_API_URL yerel adrese ayarlı ("${deger}"); yayına çıkan pakette işe yaramaz.`;
  } else if (!yerelAdres && !deger.startsWith("https://")) {
    sorun = `VITE_API_URL HTTPS değil ("${deger}"); tarayıcı karışık içerik kuralıyla istekleri engeller.`;
  }

  if (!sorun) return;
  if (otomatikOrtam) throw new Error(`Derleme durduruldu — ${sorun}`);
  console.warn(`\n⚠️  ${sorun}\n    (Yerel derleme olduğu için yalnızca uyarı.)\n`);
}


/**
 * CSP'yi derleme anında üretip Netlify'ın `_headers` dosyasına yazar.
 *
 * NEDEN netlify.toml'da DEĞİL: politikanın `connect-src` kısmı API adresini
 * içermek zorunda, o da ortama göre değişen bir derleme değişkeni
 * (VITE_API_URL). Statik bir dosyaya elle yazmak, adres değiştiğinde sessizce
 * yanlış kalması demekti. Burada zaten elimizde olan değerden türetiliyor;
 * ayrışması mümkün değil.
 *
 * NEDEN ÖNCE "Report-Only": bu uygulamada büyük dosyalar tarayıcıdan DOĞRUDAN
 * Google Drive / OneDrive'a yükleniyor (bkz. api/files.ts uploadInChunks) ve o
 * adreslerin tam listesi sağlayıcıya, hesaba ve dosya boyutuna göre değişiyor.
 * Eksik bir `connect-src` yazmak, yalnızca büyük dosya yüklerken ortaya çıkan
 * bir arıza üretirdi. Rapor modunda hiçbir şey engellenmez, ihlaller tarayıcı
 * konsoluna düşer; liste netleşince başlık adı `Content-Security-Policy`ye
 * çevrilip zorlayıcı hale getirilir (aşağıdaki ZORLAYICI bayrağı).
 */
const CSP_ZORLAYICI = false;

function cspPlugin(apiUrl: string | undefined) {
  return {
    name: "projelio-csp-headers",
    apply: "build" as const,
    closeBundle() {
      const api = (apiUrl ?? "").trim().replace(/\/+$/, "");
      // WebSocket (Socket.IO) aynı sunucuya bağlanıyor; şemayı wss'ye çeviriyoruz.
      const ws = api.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
      const baglanti = ["'self'", api, ws].filter(Boolean).join(" ");

      const politika = [
        "default-src 'self'",
        // Tüm uygulama JS'i paketleniyor; satır içi script kalmadı
        // (bkz. public/pre-paint.js).
        "script-src 'self'",
        // React satır içi stilleri CSSOM üzerinden uyguluyor (CSP'ye takılmaz),
        // ama Vite ve bazı bileşenler <style> enjekte edebiliyor.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        // Avatar/kapak görselleri Supabase'de, Drive önizleme küçük resimleri
        // Google'da; data:/blob: yerel önizleme için.
        "img-src 'self' data: blob: https:",
        `connect-src ${baglanti} https://www.googleapis.com https://storage.googleapis.com https://graph.microsoft.com https://*.sharepoint.com https://api.onedrive.com`,
        // Dosya önizlemesi: Drive'ın kendi görüntüleyicisi ve bizim içerik ucumuz.
        `frame-src 'self' ${api} https://docs.google.com https://drive.google.com`.trim(),
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; ");

      const baslik = CSP_ZORLAYICI ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
      const icerik = `/*\n  ${baslik}: ${politika}\n`;

      writeFileSync(resolve(__dirname, "dist", "_headers"), icerik, "utf8");
      console.log(`\n  CSP yazıldı (${CSP_ZORLAYICI ? "ZORLAYICI" : "rapor modu"}) -> dist/_headers\n`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  assertApiUrl(mode, env.VITE_API_URL);

  return {
    plugins: [react(), cspPlugin(env.VITE_API_URL)],
    server: { port: 5173 },
    optimizeDeps: {
      exclude: ["@projelio/shared"],
    },
  };
});
