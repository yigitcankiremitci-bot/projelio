import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hatirlatmaEpostasi, makbuzEpostasi, odemeAlinamadiEpostasi } from "./paytr-abonelik-eposta";

const URL = "https://app.projelio.app/settings/billing";

test("makbuz tutarı, kartın son 4 hanesini ve bir sonraki yenileme tarihini söyler", () => {
  const e = makbuzEpostasi({
    dil: "tr",
    planAdi: "Pro",
    yillik: false,
    tutar: 490,
    kartSon4: "7314",
    sonrakiVade: new Date("2026-11-07T12:00:00Z"),
    paketlerUrl: URL,
    ilk: false,
  });
  assert.match(e.subject, /yenilendi/);
  assert.match(e.text, /490,00 ₺/);
  assert.match(e.text, /7314/);
  assert.match(e.text, /7 Kasım 2026/);
  assert.match(e.html, /settings\/billing/);
});

test("İngilizce makbuz İngilizce metin ve tarih kullanır", () => {
  const e = makbuzEpostasi({
    dil: "en",
    planAdi: "Pro",
    yillik: true,
    tutar: 4920,
    kartSon4: null,
    sonrakiVade: new Date("2027-09-28T12:00:00Z"),
    paketlerUrl: URL,
    ilk: true,
  });
  assert.match(e.subject, /started/);
  assert.match(e.text, /28 September 2027/);
});

test("fiyat değişikliği hatırlatması eski ve yeni tutarı birlikte gösterir", () => {
  const e = hatirlatmaEpostasi({
    dil: "tr",
    tur: "fiyat",
    planAdi: "Pro",
    vade: new Date("2026-10-07T12:00:00Z"),
    tutar: 590,
    eskiTutar: 490,
    kartSon4: "7314",
    paketlerUrl: URL,
  });
  assert.match(e.text, /590,00 ₺/);
  assert.match(e.text, /490,00 ₺/);
});

test("ödeme alınamadı e-postası son tarihi söyler ve kullanıcı metnini kaçırır", () => {
  const e = odemeAlinamadiEpostasi({
    dil: "tr",
    planAdi: "<b>Pro</b>",
    tutar: 490,
    kartSon4: "7314",
    sonTarih: new Date("2026-10-22T12:00:00Z"),
    paketlerUrl: URL,
  });
  assert.match(e.text, /22 Ekim 2026/);
  assert.ok(!e.html.includes("<b>Pro</b>"));
});
