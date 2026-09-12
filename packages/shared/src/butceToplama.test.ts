import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { BudgetTransaction } from "./types";
import {
  KATEGORISIZ,
  baskinParaBirimi,
  donemNoktalari,
  paraBirimiBazinda,
  tTablolari,
  toplamlariTopla,
} from "./butceToplama";

// Bu dosyadaki toplama hem sunucunun kademe özetlerini hem ekrandaki T
// tablosunu besliyor. Buradaki bir gerileme "şirket 40.000 kazandı" ile
// "departmanlar toplamı 35.000" arasında sebebi bulunamayan bir fark demek.

function h(over: Partial<BudgetTransaction>): BudgetTransaction {
  return {
    id: Math.random().toString(36).slice(2),
    type: "income",
    amount: 0,
    currency: "TRY",
    occurredAt: "2026-09-10",
    createdAt: "2026-09-10T00:00:00Z",
    ...over,
  };
}

describe("paraBirimiBazinda", () => {
  test("gelir ve gider ayrı toplanır, net farktır", () => {
    const sonuc = paraBirimiBazinda([
      h({ type: "income", amount: 1000 }),
      h({ type: "expense", amount: 400 }),
    ]);
    assert.deepEqual(sonuc, [{ currency: "TRY", income: 1000, expense: 400, net: 600 }]);
  });

  test("payout gider sayılır — kasadan çıkan paradır", () => {
    const sonuc = paraBirimiBazinda([h({ type: "income", amount: 1000 }), h({ type: "payout", amount: 250 })]);
    assert.deepEqual(sonuc, [{ currency: "TRY", income: 1000, expense: 250, net: 750 }]);
  });

  test("para birimleri ASLA toplanmaz, ayrı kovalarda durur", () => {
    const sonuc = paraBirimiBazinda([
      h({ type: "income", amount: 1000, currency: "TRY" }),
      h({ type: "income", amount: 1000, currency: "USD" }),
    ]);
    assert.equal(sonuc.length, 2);
    assert.deepEqual(sonuc.map((s) => s.currency), ["TRY", "USD"]);
    assert.equal(sonuc[0].income, 1000);
    assert.equal(sonuc[1].income, 1000);
  });

  test("para birimi boşsa TRY sayılır (eski kayıtlar)", () => {
    const sonuc = paraBirimiBazinda([h({ type: "income", amount: 50, currency: "" })]);
    assert.deepEqual(sonuc, [{ currency: "TRY", income: 50, expense: 0, net: 50 }]);
  });

  test("hareket yoksa boş liste — uydurma sıfır satırı üretilmez", () => {
    assert.deepEqual(paraBirimiBazinda([]), []);
  });
});

describe("toplamlariTopla", () => {
  test("kademe toplaması: kendi + alt", () => {
    const kendi = paraBirimiBazinda([h({ type: "expense", amount: 5000 })]);
    const alt = paraBirimiBazinda([h({ type: "income", amount: 12000 }), h({ type: "expense", amount: 2000 })]);
    assert.deepEqual(toplamlariTopla(kendi, alt), [
      { currency: "TRY", income: 12000, expense: 7000, net: 5000 },
    ]);
  });

  test("girdileri DEĞİŞTİRMEZ — aynı özet hem kendi hem toplam içinde geçiyor", () => {
    const kendi = paraBirimiBazinda([h({ type: "income", amount: 100 })]);
    toplamlariTopla(kendi, kendi);
    assert.deepEqual(kendi, [{ currency: "TRY", income: 100, expense: 0, net: 100 }]);
  });

  test("farklı para birimleri birleşmez", () => {
    const a = paraBirimiBazinda([h({ type: "income", amount: 100, currency: "TRY" })]);
    const b = paraBirimiBazinda([h({ type: "income", amount: 100, currency: "EUR" })]);
    assert.deepEqual(toplamlariTopla(a, b).map((t) => t.currency), ["EUR", "TRY"]);
  });
});

describe("tTablolari", () => {
  test("gelir solda, gider sağda, bakiye fark", () => {
    const [t] = tTablolari([
      h({ type: "income", amount: 10000, category: "Satış" }),
      h({ type: "expense", amount: 3000, category: "Kira" }),
      h({ type: "expense", amount: 1000, category: "Kira" }),
    ]);
    assert.equal(t.gelirToplam, 10000);
    assert.equal(t.giderToplam, 4000);
    assert.equal(t.bakiye, 6000);
    // Aynı kategori tek satırda birikir.
    assert.deepEqual(t.gider.map((g) => [g.category, g.amount]), [["Kira", 4000]]);
  });

  test("kategorisiz kayıtlar tek kovada toplanır", () => {
    const [t] = tTablolari([h({ type: "expense", amount: 500 }), h({ type: "expense", amount: 500, category: "   " })]);
    assert.deepEqual(t.gider.map((g) => [g.category, g.amount]), [[KATEGORISIZ, 1000]]);
  });

  test("yüzde aynı yöndeki toplama göre hesaplanır", () => {
    const [t] = tTablolari([
      h({ type: "expense", amount: 750, category: "Personel" }),
      h({ type: "expense", amount: 250, category: "Kira" }),
      // Gelir, gider yüzdelerini etkilememeli.
      h({ type: "income", amount: 99999, category: "Satış" }),
    ]);
    assert.deepEqual(t.gider.map((g) => g.yuzde), [75, 25]);
  });

  test("büyük kalem üstte", () => {
    const [t] = tTablolari([
      h({ type: "expense", amount: 100, category: "Küçük" }),
      h({ type: "expense", amount: 900, category: "Büyük" }),
    ]);
    assert.deepEqual(t.gider.map((g) => g.category), ["Büyük", "Küçük"]);
  });

  test("para birimi başına ayrı T tablosu", () => {
    const tablolar = tTablolari([
      h({ type: "income", amount: 100, currency: "TRY" }),
      h({ type: "income", amount: 200, currency: "USD" }),
    ]);
    assert.deepEqual(tablolar.map((t) => [t.currency, t.gelirToplam]), [
      ["TRY", 100],
      ["USD", 200],
    ]);
  });
});

describe("donemNoktalari", () => {
  const bugun = new Date("2026-09-12T00:00:00Z");

  test("hareketi olmayan aylar da üretilir — grafikte boşluk atlanmamalı", () => {
    const noktalar = donemNoktalari([h({ type: "income", amount: 100, occurredAt: "2026-09-01" })], 3, bugun);
    assert.deepEqual(noktalar.map((n) => n.donem), ["2026-07", "2026-08", "2026-09"]);
    assert.deepEqual(noktalar.map((n) => n.income), [0, 0, 100]);
  });

  test("yıl sınırını doğru geçer", () => {
    const noktalar = donemNoktalari([h({ amount: 1, occurredAt: "2026-01-05" })], 3, new Date("2026-01-15T00:00:00Z"));
    assert.deepEqual(noktalar.map((n) => n.donem), ["2025-11", "2025-12", "2026-01"]);
  });

  test("birikimli bakiye ay ay taşınır", () => {
    const noktalar = donemNoktalari(
      [
        h({ type: "income", amount: 1000, occurredAt: "2026-08-03" }),
        h({ type: "expense", amount: 400, occurredAt: "2026-09-03" }),
      ],
      2,
      bugun
    );
    assert.deepEqual(noktalar.map((n) => n.birikimli), [1000, 600]);
  });

  test("pencere dışındaki hareket toplama girmez", () => {
    const noktalar = donemNoktalari([h({ type: "income", amount: 5000, occurredAt: "2024-01-01" })], 2, bugun);
    assert.deepEqual(noktalar.map((n) => n.income), [0, 0]);
  });

  test("her para birimi kendi serisini alır", () => {
    const noktalar = donemNoktalari(
      [h({ amount: 1, currency: "TRY" }), h({ amount: 1, currency: "USD" })],
      2,
      bugun
    );
    assert.equal(noktalar.length, 4);
    assert.deepEqual(Array.from(new Set(noktalar.map((n) => n.currency))), ["TRY", "USD"]);
  });

  test("hiç hareket yoksa boş — boş grafik çizilmez", () => {
    assert.deepEqual(donemNoktalari([], 12, bugun), []);
  });
});

describe("baskinParaBirimi", () => {
  test("ölçüt kayıt SAYISI, tutar değil", () => {
    const hareketler = [
      h({ amount: 50000, currency: "USD" }),
      h({ amount: 10, currency: "TRY" }),
      h({ amount: 10, currency: "TRY" }),
    ];
    assert.equal(baskinParaBirimi(hareketler), "TRY");
  });

  test("eşitlikte alfabetik — sonuç her istekte aynı olmalı", () => {
    assert.equal(baskinParaBirimi([h({ currency: "USD" }), h({ currency: "EUR" })]), "EUR");
  });

  test("boş defterde varsayılan", () => {
    assert.equal(baskinParaBirimi([]), "TRY");
  });
});
