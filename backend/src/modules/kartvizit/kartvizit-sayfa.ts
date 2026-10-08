import { KARTVIZIT_SOSYAL, kartvizitAdresi, type KartvizitSosyalAnahtar } from "@projelio/shared";
import type { KartvizitSayfaVerisi } from "./kartvizit.service";

/**
 * <adres>.projelio.app'te açılan kartvizit sayfasının HTML'i.
 *
 * Sunucuda üretiliyor: sayfa tek bir istekte, JS'siz de tam görünsün (QR'ı
 * okutan kişi çoğu zaman zayıf mobil bağlantıda). Stil ve davranış ortak iki
 * dosyada (kartvizit/_ortak/style.css, app.js) — Caddy onları doğrudan veriyor.
 * Elle kurulmuş ilk kartlarla (firdevs, selin) aynı tasarım ve aynı işaretleme:
 * app.js TR/EN geçişini data-en özniteliklerinden, "Rehbere Kaydet"in Android
 * davranışını #save'in data-* alanlarından okuyor.
 *
 * GÜVENLİK: kullanıcı verisi buraya giren HER yerde `h()`'den geçiyor; adresler
 * kullanıcının yazdığı URL değil, tutamaçtan bizim ürettiğimiz adres (bkz.
 * KARTVIZIT_SOSYAL). Sayfanın CSP'si Caddy'de (satır içi script/style yok).
 */

export function h(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const IKON = {
  konum: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  telefon:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
  whatsapp:
    '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
  eposta: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  kaydet: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  web: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
  ok: '<path d="m9 18 6-6-6-6"/>',
  paylas: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4M12 2v13"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M17 20h4v-3"/>',
};

const SOSYAL_IKON: Record<KartvizitSosyalAnahtar, string> = {
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z"/><path d="M17.5 6.5h.01"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  x: '<path d="M4 4l11.733 16H20L8.267 4Z"/><path d="M4 20l6.768-6.768M13.228 10.772 20 4"/>',
  youtube:
    '<path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3Z"/>',
  tiktok: '<path d="M21 7.917v4.034a9.948 9.948 0 0 1-5-1.951v4.5a6.5 6.5 0 1 1-8-6.326v4.326a2.5 2.5 0 1 0 4 2V3h4.083A6.005 6.005 0 0 0 21 7.917Z"/>',
  threads:
    '<path d="M19 7.5C17.667 4.5 15.333 3 12 3c-5 0-8 2.5-8 9s3.5 9 8 9 7-3 7-5-1-5-7-5c-2.5 0-3 1.25-3 2.5 0 1.5 1 2.5 2.5 2.5 2.5 0 3.5-1.5 3.5-5s-2-4-3-4-1.833.333-2.5 1"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3Z"/>',
  github:
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  behance: '<path d="M3 6h5a3 3 0 0 1 0 6H3zM3 12h6a3 3 0 0 1 0 6H3z"/><path d="M14 13h7a3.5 3.5 0 1 0-1 2.5M15 7h5"/>',
};

const svg = (ic: string, sinif?: string) => `<svg${sinif ? ` class="${sinif}"` : ""} viewBox="0 0 24 24">${ic}</svg>`;

/** Türkçe metin + varsa İngilizcesi (app.js dil düğmesiyle değiştirir). */
const ceviri = (tr: string, en?: string | null) => (en ? ` data-en="${h(en)}"` : "") + `>${h(tr)}`;

function basHarfler(ad: string): string {
  const k = ad.trim().split(/\s+/).filter(Boolean);
  const harfler = k.length > 1 ? k[0][0] + k[k.length - 1][0] : (k[0] ?? "?").slice(0, 2);
  return harfler.toLocaleUpperCase("tr");
}

export function kartvizitSayfasi(k: KartvizitSayfaVerisi): string {
  const url = kartvizitAdresi(k.adres);
  const host = url.replace(/^https:\/\//, "");
  const telSade = k.phone ? k.phone.replace(/[^\d+]/g, "") : "";
  const waNumara = telSade.replace(/^\+/, "");
  const harf = basHarfler(k.fullName);
  const favicon =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' fill='#1C222C'/><text x='32' y='42' font-family='Arial' font-weight='700' font-size='26' fill='#fff' text-anchor='middle'>${h(harf)}</text></svg>`
    );

  const hizli: string[] = [];
  if (telSade) {
    hizli.push(`<a href="tel:${h(telSade)}">${svg(IKON.telefon)}<span data-en="Call">Ara</span></a>`);
    hizli.push(`<a href="https://wa.me/${h(waNumara)}" target="_blank" rel="noopener">${svg(IKON.whatsapp)}<span>WhatsApp</span></a>`);
  }
  if (k.email) hizli.push(`<a href="mailto:${h(k.email)}">${svg(IKON.eposta)}<span data-en="Email">E-posta</span></a>`);

  const baglantilar: string[] = [];
  if (k.website) {
    const gorunen = k.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    baglantilar.push(
      `<li><a href="${h(k.website)}" target="_blank" rel="noopener">${svg(IKON.web)}<span class="label"><span class="name" data-en="Website">Web Sitesi</span><span class="handle">${h(gorunen)}</span></span>${svg(IKON.ok, "chev")}</a></li>`
    );
  }
  for (const tanim of KARTVIZIT_SOSYAL) {
    const t = k.sosyal[tanim.anahtar];
    if (!t) continue;
    baglantilar.push(
      `<li><a href="${h(tanim.adres(t))}" target="_blank" rel="noopener">${svg(SOSYAL_IKON[tanim.anahtar])}<span class="label"><span class="name">${h(tanim.ad)}</span><span class="handle">${h(tanim.gorunen(t))}</span></span>${svg(IKON.ok, "chev")}</a></li>`
    );
  }

  const unvanEn = k.titleEn || null;
  const kaydetVeri = [
    `data-name="${h(k.fullName)}"`,
    telSade ? `data-phone="${h(telSade)}"` : "",
    k.email ? `data-email="${h(k.email)}"` : "",
    k.title ? `data-title="${h(k.title)}"` : "",
    k.title ? `data-title-en="${h(unvanEn || k.title)}"` : "",
    `data-href-en="kartvizit-en.vcf"`,
  ]
    .filter(Boolean)
    .join(" ");

  const aciklama = [k.fullName, k.title].filter(Boolean).join(" — ");

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${h(k.fullName)}</title>
<meta name="description" content="${h(aciklama)} · Dijital kartvizit">
<meta name="theme-color" content="#1C222C">
<meta property="og:title" content="${h(k.fullName)}">
<meta property="og:description" content="${h(k.title || "Dijital kartvizit")}">
<meta property="og:url" content="${h(url)}">
<meta property="og:type" content="profile">
${k.avatarUrl ? `<meta property="og:image" content="${h(k.avatarUrl)}">\n` : ""}<link rel="icon" href="${h(favicon)}">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
  <div class="lang" role="group" aria-label="Dil / Language">
    <button type="button" data-lang="tr" aria-pressed="true">TR</button>
    <button type="button" data-lang="en" aria-pressed="false">EN</button>
  </div>
  <section class="card">
    ${
      k.avatarUrl
        ? `<div class="avatar"><img src="${h(k.avatarUrl)}" alt="${h(k.fullName)}" width="96" height="96"></div>`
        : `<div class="avatar" aria-hidden="true">${h(harf)}</div>`
    }
    <h1>${h(k.fullName)}</h1>
${k.title ? `    <p class="role"${ceviri(k.title, unvanEn)}</p>\n` : ""}${
    k.location ? `    <p class="loc">${svg(IKON.konum)}<span>${h(k.location)}</span></p>\n` : ""
  }${k.tagline ? `    <p class="quote"${ceviri(`“${k.tagline}”`, k.taglineEn ? `“${k.taglineEn}”` : null)}</p>\n` : ""}
${hizli.length ? `    <nav class="quick n${hizli.length}" aria-label="Hızlı iletişim" data-en-label="Quick contact">\n      ${hizli.join("\n      ")}\n    </nav>\n` : ""}
    <a class="save" id="save" href="kartvizit.vcf" ${kaydetVeri}>${svg(IKON.kaydet)}<span data-en="Save Contact">Rehbere Kaydet</span></a>
${
  baglantilar.length
    ? `
    <h2 class="section-title" data-en="Links">Bağlantılar</h2>
    <ul class="links">
      ${baglantilar.join("\n      ")}
    </ul>
`
    : ""
}
    <div class="foot">
      <button type="button" id="share">${svg(IKON.paylas)}<span data-en="Share">Paylaş</span></button>
      <button type="button" id="showqr">${svg(IKON.qr)}<span data-en="Show QR">QR Göster</span></button>
    </div>
  </section>
  <p class="credit"><a href="https://projelio.app" target="_blank" rel="noopener"><span>${h(host)}</span> · <span data-en="free with Projelio">Projelio ile ücretsiz</span></a></p>
</main>

<dialog id="qrdialog" aria-label="QR kod" data-en-label="QR code">
  <div class="qr"><img src="qr.svg" alt="${h(host)} QR kodu" data-en-alt="${h(host)} QR code" width="300" height="300"></div>
  <p data-en="Scan with your camera to open my contact details.">Kameranla okut, iletişim bilgilerim açılsın.</p>
  <button type="button" id="closeqr" data-en="Close">Kapat</button>
</dialog>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script src="app.js" defer></script>
</body>
</html>
`;
}

/** Adres yoksa ya da kart yayından kaldırılmışsa. Kimin olduğunu söylemez. */
export function kartvizitBulunamadiSayfasi(): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Kartvizit bulunamadı</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
  <section class="card">
    <h1>Kartvizit bulunamadı</h1>
    <p class="role">Bu adreste yayında bir kartvizit yok. · There is no business card at this address.</p>
  </section>
  <p class="credit"><a href="https://projelio.app">projelio.app</a></p>
</main>
</body>
</html>
`;
}
