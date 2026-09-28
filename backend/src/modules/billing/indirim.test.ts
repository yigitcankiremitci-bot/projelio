import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ilkOdemedenSonraKalan,
  indirimliTutar,
  kalaniAzalt,
  kodBicimiGecerli,
  kodNormallestir,
  kodUygunlugu,
  sonrakiOdemedeIndirim,
  type IndirimKodu,
} from "./indirim";

const KOD: IndirimKodu = {
  id: "k1",
  kod: "ILKAY50",
  tur: "yuzde",
  deger: 50,
  kapsam: "hepsi",
  planKeys: null,
  periods: null,
  sure: "ilk",
  donemSayisi: null,
  sonTarih: null,
  kullanimSiniri: null,
  aktif: true,
};
const SIMDI = new Date("2026-10-01T10:00:00Z");
const BAGLAM = { simdi: SIMDI, kapsam: "abonelik" as const, planKey: "pro", period: "monthly", kullanimSayisi: 0, buKullaniciKullandi: false };

test("kod büyük harfe çevrilir ve boşlukları atılır", () => {
  assert.equal(kodNormallestir(" ilkay 50 "), "ILKAY50");
  // Hangi klavyeyle yazılırsa yazılsın aynı kod: i, ı ve İ hepsi I.
  assert.equal(kodNormallestir("ılkay50"), "ILKAY50");
  assert.equal(kodNormallestir("İLKAY50"), "ILKAY50");
  assert.equal(kodNormallestir("şükrü"), "ŞÜKRÜ");
  assert.ok(kodBicimiGecerli("KURUCU-30"));
  assert.ok(!kodBicimiGecerli("AB"));
  assert.ok(!kodBicimiGecerli("KOD!"));
});

test("yüzde ve sabit tutar indirimi kuruş hassasiyetinde hesaplanır", () => {
  assert.equal(indirimliTutar(490, { tur: "yuzde", deger: 50 }), 245);
  assert.equal(indirimliTutar(490, { tur: "tutar", deger: 100 }), 390);
  assert.equal(indirimliTutar(499.99, { tur: "yuzde", deger: 33 }), 334.99);
  assert.equal(indirimliTutar(490, null), 490);
});

test("indirimli tutar 1 ₺'nin altına inmez, %100 bile olsa", () => {
  assert.equal(indirimliTutar(490, { tur: "yuzde", deger: 100 }), 1);
  assert.equal(indirimliTutar(490, { tur: "tutar", deger: 1000 }), 1);
  assert.equal(indirimliTutar(490, { tur: "yuzde", deger: 99.9 }), 1);
});

test("uygun kod kabul edilir", () => {
  assert.deepEqual(kodUygunlugu(KOD, BAGLAM), { uygun: true });
});

test("kapalı, süresi dolmuş, tükenmiş ve daha önce kullanılmış kod reddedilir", () => {
  assert.deepEqual(kodUygunlugu(null, BAGLAM), { uygun: false, sebep: "yok" });
  assert.deepEqual(kodUygunlugu({ ...KOD, aktif: false }, BAGLAM), { uygun: false, sebep: "kapali" });
  assert.deepEqual(kodUygunlugu({ ...KOD, sonTarih: "2026-09-30T00:00:00Z" }, BAGLAM), { uygun: false, sebep: "suresi_doldu" });
  assert.deepEqual(kodUygunlugu({ ...KOD, kullanimSiniri: 10 }, { ...BAGLAM, kullanimSayisi: 10 }), { uygun: false, sebep: "tukendi" });
  assert.deepEqual(kodUygunlugu(KOD, { ...BAGLAM, buKullaniciKullandi: true }), { uygun: false, sebep: "kullanildi" });
});

test("kapsam ve paket sınırı uygulanır", () => {
  assert.deepEqual(kodUygunlugu({ ...KOD, kapsam: "lio" }, BAGLAM), { uygun: false, sebep: "kapsam_disi" });
  assert.deepEqual(kodUygunlugu({ ...KOD, kapsam: "abonelik" }, { ...BAGLAM, kapsam: "lio" }), { uygun: false, sebep: "kapsam_disi" });
  assert.deepEqual(kodUygunlugu({ ...KOD, planKeys: ["business"] }, BAGLAM), { uygun: false, sebep: "paket_disi" });
  assert.deepEqual(kodUygunlugu({ ...KOD, periods: ["yearly"] }, BAGLAM), { uygun: false, sebep: "paket_disi" });
  // Lio paketinde abonelik paket sınırı aranmaz.
  assert.deepEqual(kodUygunlugu({ ...KOD, planKeys: ["business"] }, { ...BAGLAM, kapsam: "lio" }), { uygun: true });
});

test("süre: ilk ödeme, ilk N ödeme ve süresiz", () => {
  assert.equal(ilkOdemedenSonraKalan({ sure: "ilk", donemSayisi: null }), 0);
  assert.equal(ilkOdemedenSonraKalan({ sure: "donem", donemSayisi: 3 }), 2);
  assert.equal(ilkOdemedenSonraKalan({ sure: "surekli", donemSayisi: null }), null);
});

test("kalan dönem azaldıkça indirim biter, süresiz indirim hiç bitmez", () => {
  assert.equal(sonrakiOdemedeIndirim(2, true), true);
  assert.equal(sonrakiOdemedeIndirim(0, true), false);
  assert.equal(sonrakiOdemedeIndirim(null, true), true);
  assert.equal(sonrakiOdemedeIndirim(null, false), false);
  assert.equal(kalaniAzalt(2), 1);
  assert.equal(kalaniAzalt(0), 0);
  assert.equal(kalaniAzalt(null), null);
});
