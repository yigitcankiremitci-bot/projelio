import { strict as assert } from "node:assert";
import { test } from "node:test";
import { aylikKarsilikHesapla, aylikToplamlar } from "./hesapAbonelik";

test("aylık tutar olduğu gibi kalır", () => {
  assert.equal(aylikKarsilikHesapla(40, "monthly"), 40);
});

test("yıllık tutar 12'ye bölünür", () => {
  assert.equal(aylikKarsilikHesapla(1200, "yearly"), 100);
});

test("3 ve 6 aylık aralıklar da normalleşir", () => {
  assert.equal(aylikKarsilikHesapla(300, "quarterly"), 100);
  assert.equal(aylikKarsilikHesapla(600, "semiannual"), 100);
});

test("haftalık tutar 4 değil 4,345 ile çarpılır", () => {
  // "4 hafta = 1 ay" demek yılda 13 ödeme yapan kalemi %8 eksik gösterirdi.
  const aylik = aylikKarsilikHesapla(100, "weekly") as number;
  assert.ok(aylik > 434 && aylik < 435, `beklenen ~434,5 idi: ${aylik}`);
});

test("ücretsiz ya da eksik kayıt hesaba girmez", () => {
  assert.equal(aylikKarsilikHesapla(0, "monthly"), null);
  assert.equal(aylikKarsilikHesapla(40, undefined), null);
  assert.equal(aylikKarsilikHesapla(undefined, "monthly"), null);
});

test("toplamlar para birimi başına ayrı tutulur — kur dönüşümü YOK", () => {
  const toplam = aylikToplamlar([
    { isPaid: true, amount: 40, currency: "USD", billingInterval: "monthly" },
    { isPaid: true, amount: 1200, currency: "USD", billingInterval: "yearly" },
    { isPaid: true, amount: 500, currency: "TRY", billingInterval: "monthly" },
    // Ücretsiz hesap toplamı etkilemez.
    { isPaid: false, amount: 999, currency: "TRY", billingInterval: "monthly" },
  ]);
  assert.deepEqual(toplam, [
    { currency: "TRY", amount: 500 },
    { currency: "USD", amount: 140 },
  ]);
});

test("hiç ücretli abonelik yoksa toplam boş döner", () => {
  assert.deepEqual(aylikToplamlar([{ isPaid: false, currency: "TRY" }]), []);
});
