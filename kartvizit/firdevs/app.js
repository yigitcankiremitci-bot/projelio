"use strict";
const CARD_URL = document.querySelector('meta[property="og:url"]').content;

// ---- Dil: Türkçe tarayıcıya TR, diğer herkese EN. Elle seçim hatırlanır.
// Metinler HTML'de Türkçe durur (JS yoksa da sayfa çalışsın); İngilizcesi
// data-en (metin), data-en-label (aria-label), data-en-alt (alt) özniteliklerinde.
const UI = {
  tr: { share: "İletişim bilgilerim:", copied: "Bağlantı kopyalandı" },
  en: { share: "My contact details:", copied: "Link copied" }
};
const STORE_KEY = "kart-lang";
let lang = "tr";

const readStored = () => { try { return localStorage.getItem(STORE_KEY); } catch (_) { return null; } };
const writeStored = (v) => { try { localStorage.setItem(STORE_KEY, v); } catch (_) {} };
const detect = () => {
  const first = (navigator.languages && navigator.languages[0]) || navigator.language || "";
  return first.toLowerCase().startsWith("tr") ? "tr" : "en";
};

const swap = (el, attr, enAttr) => {
  const trKey = "tr" + enAttr;
  if (!(trKey in el.dataset)) el.dataset[trKey] = attr ? el.getAttribute(attr) : el.textContent;
  const value = lang === "en" ? el.dataset[enAttr] : el.dataset[trKey];
  if (attr) el.setAttribute(attr, value); else el.textContent = value;
};

const applyLang = (next) => {
  lang = next;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-en]").forEach((el) => swap(el, null, "en"));
  document.querySelectorAll("[data-en-label]").forEach((el) => swap(el, "aria-label", "enLabel"));
  document.querySelectorAll("[data-en-alt]").forEach((el) => swap(el, "alt", "enAlt"));
  document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  setupSave();
};

document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => {
  writeStored(b.dataset.lang);
  applyLang(b.dataset.lang);
}));

// ---- Rehbere Kaydet: iOS/masaüstü .vcf'yi doğrudan açar (download özniteliği YOK,
// yoksa iOS kişi kartını göstermek yerine dosyayı İndirilenler'e atar).
// Android Chrome .vcf'yi her koşulda indirdiği için orada Rehber uygulamasının
// "yeni kişi" ekranı bilgiler dolu olarak doğrudan açılır; açılamazsa .vcf'ye düşer.
function setupSave() {
  const save = document.getElementById("save");
  if (!save) return;
  const d = save.dataset;
  const vcf = lang === "en" && d.hrefEn ? d.hrefEn : d.hrefTr || save.getAttribute("href");
  if (!d.hrefTr) d.hrefTr = save.getAttribute("href");
  const vcfUrl = new URL(vcf, location.href).href;
  if (!/Android/i.test(navigator.userAgent)) { save.href = vcf; return; }
  const extras = {
    name: d.name,
    phone: d.phone,
    email: d.email,
    job_title: lang === "en" && d.titleEn ? d.titleEn : d.title
  };
  const parts = Object.entries(extras)
    .filter(([, v]) => v)
    .map(([k, v]) => "S." + k + "=" + encodeURIComponent(v));
  parts.push("S.browser_fallback_url=" + encodeURIComponent(vcfUrl));
  save.href = "intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;" + parts.join(";") + ";end";
}

applyLang(readStored() || detect());

// ---- Paylaş / QR
const toast = (msg) => {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
};

document.getElementById("share").addEventListener("click", async () => {
  const data = { title: document.querySelector("h1").textContent, text: UI[lang].share, url: CARD_URL };
  if (navigator.share) {
    try { await navigator.share(data); } catch (_) {}
    return;
  }
  try {
    await navigator.clipboard.writeText(CARD_URL);
    toast(UI[lang].copied);
  } catch (_) {
    toast(CARD_URL);
  }
});

const dlg = document.getElementById("qrdialog");
document.getElementById("showqr").addEventListener("click", () => dlg.showModal());
document.getElementById("closeqr").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
