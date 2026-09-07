import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ayEkle, findPlan, krediAyiBasi, PLANS, planPriceUsd, SATIN_ALINABILIR, YEARLY_MONTHS } from "./billing.plans";

test("vitrin fiyatları duyurulan liste ile birebir aynı", () => {
  // Bu sayılar tanıtım sitesinde ve mağaza listelerinde yazılı. Değiştirmek
  // yalnızca kod değişikliği değil, ilan edilmiş bir fiyatı değiştirmektir:
  // testin kırılması "önce iyzico planlarını ve landing'i güncelle" demektir.
  assert.deepEqual(
    PLANS.filter((p) => p.key !== "free").map((p) => [p.key, p.priceUsdMonthly, p.priceUsdYearly, p.monthlyCredits]),
    [
      ["starter", 4.99, 49.9, 20_000],
      ["pro", 9.99, 99.9, 50_000],
      ["business", 24.99, 249.9, 150_000],
    ]
  );
});

test("yıllık fiyat 10 aylık ücrete eşit (2 ay bedava) ve kuruşta yuvarlanmış", () => {
  for (const plan of PLANS) {
    assert.equal(
      plan.priceUsdYearly,
      Math.round(plan.priceUsdMonthly * YEARLY_MONTHS * 100) / 100,
      `${plan.key} yıllık fiyatı aylık ücretin ${YEARLY_MONTHS} katı olmalı`
    );
    // Kayan nokta artığı (49.900000000000006) vitrinde "49.900000000000006 $"
    // olarak görünürdü.
    assert.equal(plan.priceUsdYearly, Number(plan.priceUsdYearly.toFixed(2)));
  }
});

test("plan anahtarları tekil ve ücretsiz plan satın alınabilir listesinde değil", () => {
  const anahtarlar = PLANS.map((p) => p.key);
  assert.equal(new Set(anahtarlar).size, anahtarlar.length);
  assert.equal(SATIN_ALINABILIR.includes("free" as never), false);
  for (const key of SATIN_ALINABILIR) {
    const plan = findPlan(key);
    assert.ok(plan, `${key} katalogda yok`);
    assert.ok(plan.priceUsdMonthly > 0, `${key} ücretli olmalı`);
    assert.ok(plan.monthlyCredits > 0, `${key} kredi vermeli`);
  }
});

test("planPriceUsd dönem farkını çözer", () => {
  const pro = findPlan("pro")!;
  assert.equal(planPriceUsd(pro, "monthly"), 9.99);
  assert.equal(planPriceUsd(pro, "yearly"), 99.9);
});

test("ayEkle ayın son gününü taşırmaz", () => {
  // 31 Ocak + 1 ay: JS'in ham Date'i 3 Mart'a taşırdı, dönem sınırı her ay kayardı.
  assert.equal(ayEkle(new Date("2026-01-31T10:00:00Z"), 1).toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(ayEkle(new Date("2024-01-31T10:00:00Z"), 1).toISOString(), "2024-02-29T10:00:00.000Z");
  assert.equal(ayEkle(new Date("2026-03-31T10:00:00Z"), 1).toISOString(), "2026-04-30T10:00:00.000Z");
});

test("ayEkle olağan durumda günü korur ve yılı devreder", () => {
  assert.equal(ayEkle(new Date("2026-09-07T08:30:00Z"), 1).toISOString(), "2026-10-07T08:30:00.000Z");
  assert.equal(ayEkle(new Date("2026-09-07T08:30:00Z"), 12).toISOString(), "2027-09-07T08:30:00.000Z");
});

test("krediAyiBasi ayın sınırını abonelik tarihine sabitler", () => {
  const baslangic = new Date("2026-01-07T09:00:00Z");
  // Aynı ay içinde: hâlâ ilk kredi ayı.
  assert.equal(krediAyiBasi(baslangic, new Date("2026-01-20T00:00:00Z"))!.toISOString(), "2026-01-07T09:00:00.000Z");
  // Ayın 7'si geçilince ikinci kredi ayı başlar.
  assert.equal(krediAyiBasi(baslangic, new Date("2026-02-08T00:00:00Z"))!.toISOString(), "2026-02-07T09:00:00.000Z");
  // 7'sinden HEMEN ÖNCE hâlâ önceki ay — bir gün erken yükleme yapılmasın.
  assert.equal(krediAyiBasi(baslangic, new Date("2026-02-07T08:59:00Z"))!.toISOString(), "2026-01-07T09:00:00.000Z");
});

test("krediAyiBasi dönem başlamadan ya da 12 ay dolduktan sonra kredi vermez", () => {
  const baslangic = new Date("2026-01-07T09:00:00Z");
  assert.equal(krediAyiBasi(baslangic, new Date("2026-01-01T00:00:00Z")), null);
  // 12 ay dolduktan sonra yeni dönemi yenileme olayı açar; buradan kredi çıkmaz.
  assert.equal(krediAyiBasi(baslangic, new Date("2027-01-08T00:00:00Z")), null);
  // Son ay (12.) hâlâ geçerli.
  assert.equal(krediAyiBasi(baslangic, new Date("2026-12-20T00:00:00Z"))!.toISOString(), "2026-12-07T09:00:00.000Z");
});

test("ayın 31'inde başlayan yıllık abonelik şubatta kaymaz", () => {
  const baslangic = new Date("2026-01-31T09:00:00Z");
  assert.equal(krediAyiBasi(baslangic, new Date("2026-03-01T00:00:00Z"))!.toISOString(), "2026-02-28T09:00:00.000Z");
  // Mart'ta yeniden 31'ine döner: ay sonuna sabitleme kalıcı kayma yaratmamalı.
  assert.equal(krediAyiBasi(baslangic, new Date("2026-04-01T00:00:00Z"))!.toISOString(), "2026-03-31T09:00:00.000Z");
});
