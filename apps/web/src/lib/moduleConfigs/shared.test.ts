import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { countBy, countWhere, fmtMoney, joinDetail, labelOf, moneyStats, opts, sumByCurrency } from "./shared";

// Modül tanımlarının paylaştığı yardımcılar. 40 modülün göstergeleri bu
// fonksiyonlara dayandığı için buradaki bir hata her modüle yayılır.

function rec(data: Record<string, unknown>, id = Math.random().toString(36).slice(2)) {
  return { id, moduleKey: "test", data, createdAt: "2026-08-12T00:00:00Z" } as never;
}

describe("sumByCurrency — para birimleri karışmamalı", () => {
  test("aynı para birimi toplanır", () => {
    const t = sumByCurrency([rec({ currency: "TRY", amount: 100 }), rec({ currency: "TRY", amount: 250 })]);
    assert.equal(t.get("TRY"), 350);
    assert.equal(t.size, 1);
  });

  test("farklı para birimleri ASLA toplanmaz", () => {
    // Kur dönüşümü yok; 100 TRY + 100 USD = 200 hiçbir zaman doğru değil.
    const t = sumByCurrency([rec({ currency: "TRY", amount: 100 }), rec({ currency: "USD", amount: 100 })]);
    assert.equal(t.get("TRY"), 100);
    assert.equal(t.get("USD"), 100);
    assert.equal(t.size, 2);
  });

  test("para birimi belirtilmemişse TRY sayılır", () => {
    const t = sumByCurrency([rec({ amount: 40 }), rec({ currency: "TRY", amount: 60 })]);
    assert.equal(t.get("TRY"), 100);
    assert.equal(t.size, 1);
  });

  test("sayı olmayan tutarlar 0 sayılır, toplam bozulmaz", () => {
    const t = sumByCurrency([rec({ currency: "TRY", amount: "abc" }), rec({ currency: "TRY", amount: 50 })]);
    assert.equal(t.get("TRY"), 50);
  });

  test("alternatif tutar alanı okunabilir", () => {
    const t = sumByCurrency([rec({ currency: "TRY", plannedAmount: 75 })], "plannedAmount");
    assert.equal(t.get("TRY"), 75);
  });

  test("boş liste boş harita döndürür", () => {
    assert.equal(sumByCurrency([]).size, 0);
  });
});

describe("moneyStats", () => {
  test("hiç kayıt yoksa sıfırlı tek gösterge", () => {
    const s = moneyStats("Toplam", []);
    assert.equal(s.length, 1);
    assert.ok(s[0].value.includes("0"));
    assert.equal(s[0].label, "Toplam");
  });

  test("tek para birimi varsa etikete para birimi eklenmez", () => {
    const s = moneyStats("Toplam", [rec({ currency: "TRY", amount: 100 })]);
    assert.equal(s.length, 1);
    assert.equal(s[0].label, "Toplam");
  });

  test("birden fazla para birimi varsa etiketler ayrışır", () => {
    const s = moneyStats("Toplam", [rec({ currency: "TRY", amount: 100 }), rec({ currency: "USD", amount: 100 })]);
    assert.equal(s.length, 2);
    const labels = s.map((x) => x.label).sort();
    assert.deepEqual(labels, ["Toplam (TRY)", "Toplam (USD)"]);
    // Etiketler benzersiz olmalı — React'te key olarak kullanılıyor.
    assert.equal(new Set(labels).size, 2);
  });

  test("negatif toplam da biçimlendirilir", () => {
    const s = moneyStats("Net", [rec({ currency: "TRY", amount: -500 })]);
    assert.ok(s[0].value.includes("500"));
  });
});

describe("fmtMoney", () => {
  test("geçerli tutarı biçimlendirir", () => {
    const v = fmtMoney(1234.5, "TRY");
    assert.ok(v.includes("1.234") || v.includes("1234"), v);
  });

  test("sayı olmayan girdi boş string döndürür", () => {
    assert.equal(fmtMoney("abc", "TRY"), "");
    assert.equal(fmtMoney(undefined, "TRY"), "");
  });

  test("bilinmeyen para biriminde patlamaz", () => {
    const v = fmtMoney(10, "XYZ_GECERSIZ");
    assert.equal(typeof v, "string");
    assert.ok(v.length > 0);
  });

  test("para birimi verilmezse TRY varsayar", () => {
    assert.equal(typeof fmtMoney(10, undefined), "string");
  });
});

describe("countBy / countWhere", () => {
  const records = [rec({ status: "open" }), rec({ status: "open" }), rec({ status: "closed" }), rec({})];

  test("countBy tam eşleşme sayar", () => {
    assert.equal(countBy(records, "status", "open"), 2);
    assert.equal(countBy(records, "status", "closed"), 1);
    assert.equal(countBy(records, "status", "yok"), 0);
  });

  test("countWhere koşul sayar", () => {
    assert.equal(countWhere(records, (d) => d.status !== "closed"), 3);
    assert.equal(countWhere(records, () => false), 0);
  });

  test("alan yoksa sayılmaz", () => {
    assert.equal(countBy(records, "olmayanAlan", "x"), 0);
  });
});

describe("opts / labelOf", () => {
  const MAP = { open: "Açık", closed: "Kapandı" };

  test("opts select seçeneklerine çevirir", () => {
    assert.deepEqual(opts(MAP), [
      { value: "open", label: "Açık" },
      { value: "closed", label: "Kapandı" },
    ]);
  });

  test("labelOf bilinen değeri çevirir", () => {
    assert.equal(labelOf(MAP, "open"), "Açık");
  });

  test("labelOf bilinmeyen değerde undefined döndürür", () => {
    // Eski kayıtlarda artık kataloğa uymayan değerler kalmış olabilir;
    // ekranda ham anahtar görünmemeli.
    assert.equal(labelOf(MAP, "artik_gecersiz"), undefined);
    assert.equal(labelOf(MAP, undefined), undefined);
    assert.equal(labelOf(MAP, 42), undefined);
  });
});

describe("joinDetail", () => {
  test("dolu parçaları birleştirir", () => {
    assert.equal(joinDetail("a", "b", "c"), "a · b · c");
  });

  test("boş parçaları atar", () => {
    assert.equal(joinDetail("a", undefined, "", null, false, "b"), "a · b");
  });

  test("hepsi boşsa undefined döndürür", () => {
    assert.equal(joinDetail(undefined, "", null, false), undefined);
    assert.equal(joinDetail(), undefined);
  });
});
