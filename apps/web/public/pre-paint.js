/*
 * Sayfa BOYANMADAN önce çalışması gereken iki ayar.
 *
 * NEDEN AYRI DOSYA: bu kod index.html içinde satır içi <script> olarak duruyordu.
 * Satır içi script, `script-src 'self'` içeren bir CSP tarafından engellenir —
 * yani tam CSP'nin önündeki tek engel buydu (bkz. netlify.toml / vite.config.ts).
 * Karma (hash) vermek de bir seçenekti ama bu kod theme.ts ve fontScale.ts ile
 * senkron tutuluyor; her düzenlemede karma bozulur ve sayfa sessizce temasız
 * açılırdı. Ayrı dosya, düzenlenebilir kalmasını sağlıyor.
 *
 * NEDEN <head> İÇİNDE, defer/module YOK: bu script'in DOM boyanmadan önce
 * çalışması şart. `defer` ya da `type="module"` olsaydı boyamadan sonraya
 * kalır ve tam da önlemeye çalıştığı titremeyi geri getirirdi.
 *
 * public/ altında: Vite bu klasörü olduğu gibi kopyalar, içeriği paketlemez.
 * Dolayısıyla adresi sabittir (/pre-paint.js) ve CSP açısından 'self' sayılır.
 */
(function () {
  // Ayarlar > Erişilebilirlik'te seçilen yazı boyutu.
  // Değerler src/lib/fontScale.ts ile senkron tutulmalı.
  try {
    var v = localStorage.getItem("projelio_font_scale");
    var scale = v === "xsmall" ? 0.85 : v === "small" ? 0.92 : v === "large" ? 1.15 : v === "xlarge" ? 1.3 : 1;
    if (scale !== 1) {
      document.documentElement.style.zoom = String(scale);
    }
  } catch (e) {}

  // Karanlık mod seçiliyse temel yüzey renklerini önceden uygula.
  // Değerler packages/shared/src/theme.ts (colors.dark) ile senkron tutulmalı;
  // anahtar adı src/theme/preferences.ts (THEME_MODE_KEY) ile.
  try {
    if (localStorage.getItem("projelio_theme_mode") === "dark") {
      var root = document.documentElement.style;
      root.setProperty("--color-primary", "#8593A8");
      root.setProperty("--color-primary-dark", "#3E4858");
      root.setProperty("--color-background", "#12151B");
      root.setProperty("--color-surface", "#1B2028");
      root.setProperty("--color-text-primary", "#F1F3F5");
      root.setProperty("--color-text-secondary", "#9AA2B0");
      root.setProperty("--color-placeholder", "#9AA2B0");
      root.setProperty("--color-border", "#2A3140");
    }
  } catch (e) {}
})();
