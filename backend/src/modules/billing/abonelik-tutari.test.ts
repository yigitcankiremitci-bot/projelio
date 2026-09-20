import { strict as assert } from "node:assert";
import { test } from "node:test";
import { abonelikTutari, aylikKarsilikTl } from "./abonelik-tutari";
import { findPlan, FREE_PLAN } from "./billing.plans";

const starter = findPlan("starter")!;

test("tutar kurdan hesaplanır ve TL döner", () => {
  // 4,99 × 50 = 249,50 -> 10 ₺ adımıyla yukarı: 250
  assert.deepEqual(abonelikTutari(starter, "monthly", 50), { amount: 250, currency: "TRY" });
});

test("yıllık dönemde yıllık toplam kullanılır", () => {
  const yillik = abonelikTutari(starter, "yearly", 50)!;
  const aylik = abonelikTutari(starter, "monthly", 50)!;
  // Yıllıkta ~2 ay bedava (10 ay hesabı), yani toplam 12 aylık
  // tutarın altında ama aylık tutarın belirgin katı. Aralık bilerek geniş:
  // bu test fiyat değişince değil, "yıllık dönem aylık tutarı dönüyor" gibi
  // bir hata olunca düşsün.
  assert.ok(yillik.amount > aylik.amount * 9, "yıllık toplam aylığın katı olmalı");
  assert.ok(yillik.amount < aylik.amount * 12, "yıllıkta indirim olmalı");
  assert.equal(yillik.currency, "TRY");
});

test("para birimi HER ZAMAN TL", () => {
  // Tahsilat TL; katalogdaki USD yalnızca iç referans. Bu bozulursa müşteriye
  // dövizle fiyat göstermiş oluruz — Türkiye'de yerleşik müşterilerde sorunlu.
  for (const donem of ["monthly", "yearly"] as const) {
    assert.equal(abonelikTutari(starter, donem, 50)!.currency, "TRY");
  }
});

test("kur yoksa null — uydurma kurla satış yapılmaz", () => {
  assert.equal(abonelikTutari(starter, "monthly", null), null);
});

test("ücretsiz plan için tutar yok", () => {
  assert.equal(abonelikTutari(FREE_PLAN, "monthly", 50), null);
});

test("kodsuz satır fiyatı EZMEZ — panelin yazdığı tutar yalnızca önbellek", () => {
  // Fiyat değişince panelin eski yazdığı tutar vitrinde kalıyordu: katalog
  // 2.520 derken site 2.440 gösteriyordu (2026-09-20).
  const sonuc = abonelikTutari(starter, "monthly", 50, {
    referenceCode: null,
    priceAmount: 199,
    currency: "TRY",
  });
  assert.deepEqual(sonuc, { amount: 250, currency: "TRY" });
});

test("sağlayıcıda sabitlenmiş tutar hesaplanandan ÖNCE gelir", () => {
  // Sağlayıcı planında tutar sabitse karttan çekilecek olan odur; hesaplanmış
  // bir rakam göstermek kullanıcıya bir tutar deyip başkasını çekmek olurdu.
  const sonuc = abonelikTutari(starter, "monthly", 50, {
    referenceCode: "PLAN-123",
    priceAmount: 199,
    currency: "TRY",
  });
  assert.deepEqual(sonuc, { amount: 199, currency: "TRY" });
});

test("sağlayıcı satırı tutarsızsa kurdan hesaplamaya düşer", () => {
  // Referans kodu girilmiş ama tutar boş bırakılmış bir satır, eskiden tüm
  // fiyatı gizliyordu: site aylarca USD'den başka bir şey göstermedi.
  const sonuc = abonelikTutari(starter, "monthly", 50, {
    referenceCode: "PLAN-123",
    priceAmount: null,
    currency: "TRY",
  });
  assert.deepEqual(sonuc, { amount: 250, currency: "TRY" });
});

test("yıllığın aylık karşılığı bölmeyle değil katalogdan hesaplanır", () => {
  // 4,16 × 50 = 208 -> 10 ₺ adımıyla yukarı: 210. Yıllık toplamı 12'ye bölmek
  // küsurat verirdi (2.520 / 12 = 210 tutuyor ama başka kurda tutmaz); kural
  // aynı kalsın diye katalogdaki aylık karşılıktan gidiliyor.
  assert.equal(aylikKarsilikTl(starter, 50), 210);
});

test("yıllık toplam, vitrindeki aylık karşılığın TAM 12 katı", () => {
  // Vitrin "210 ₺/ay" derken toplamın 2.440 çıkması (2.440 / 12 = 203,33)
  // müşteriye iki farklı rakam göstermekti; ikisi tek kaynaktan gelmeli.
  const aylikKarsilik = aylikKarsilikTl(starter, 50)!;
  assert.equal(abonelikTutari(starter, "yearly", 50)!.amount, aylikKarsilik * 12);
});

test("aylık karşılık: kur yoksa ve ücretsiz planda null", () => {
  assert.equal(aylikKarsilikTl(starter, null), null);
  assert.equal(aylikKarsilikTl(FREE_PLAN, 50), null);
});
