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
