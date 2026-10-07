"use strict";
const CARD_URL = "https://firdevs.projelio.app";

const toast = (msg) => {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
};

document.getElementById("share").addEventListener("click", async () => {
  const data = { title: "Firdevs Ceren Ayberk", text: "İletişim bilgilerim:", url: CARD_URL };
  if (navigator.share) {
    try { await navigator.share(data); } catch (_) {}
    return;
  }
  try {
    await navigator.clipboard.writeText(CARD_URL);
    toast("Bağlantı kopyalandı");
  } catch (_) {
    toast(CARD_URL);
  }
});

const dlg = document.getElementById("qrdialog");
document.getElementById("showqr").addEventListener("click", () => dlg.showModal());
document.getElementById("closeqr").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

// Rehbere Kaydet: iOS/masaüstü .vcf'yi doğrudan açar (download özniteliği YOK,
// yoksa iOS kişi kartını göstermek yerine dosyayı İndirilenler'e atar).
// Android Chrome .vcf'yi her koşulda indirdiği için orada Rehber uygulamasının
// "yeni kişi" ekranı bilgiler dolu olarak doğrudan açılır; açılamazsa .vcf'ye düşer.
const save = document.getElementById("save");
if (save && /Android/i.test(navigator.userAgent)) {
  const d = save.dataset;
  const extras = { name: d.name, phone: d.phone, email: d.email, job_title: d.title };
  const parts = Object.entries(extras)
    .filter(([, v]) => v)
    .map(([k, v]) => "S." + k + "=" + encodeURIComponent(v));
  parts.push("S.browser_fallback_url=" + encodeURIComponent(new URL(save.getAttribute("href"), location.href).href));
  save.href = "intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;" + parts.join(";") + ";end";
}
