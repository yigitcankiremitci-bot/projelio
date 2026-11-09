import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { iskontoluFiyat, kalemTutariKurus, tutarToplami } from "./iskontoluFiyat";
import { kdvDahilFiyat } from "./siparisKalemleri";

// Ticari veri: her beklenen değer elle, kuruşu kuruşuna hesaplandı.

describe("iskontoluFiyat", () => {
  test("önce iskonto, sonra KDV: 100 TL, %12,5, %10 → 87,50 → 96,25", () => {
    assert.deepEqual(iskontoluFiyat(100, 12.5, 10), { listeNet: 100, listeKdvDahil: 110, net: 87.5, kdvDahil: 96.25 });
  });

  test("iskonto yoksa net = liste", () => {
    assert.deepEqual(iskontoluFiyat(749.17, 0, 20), { listeNet: 749.17, listeKdvDahil: 899, net: 749.17, kdvDahil: 899 });
    assert.deepEqual(iskontoluFiyat(749.17, null, 20), iskontoluFiyat(749.17, 0, 20));
  });

  test("her adım yarım yukarı kuruşa yuvarlanır", () => {
    // 10,05 × 0,85 = 8,5425 → 8,54 ; 8,54 × 1,20 = 10,248 → 10,25
    assert.deepEqual(iskontoluFiyat(10.05, 15, 20), { listeNet: 10.05, listeKdvDahil: 12.06, net: 8.54, kdvDahil: 10.25 });
    // 0,01 × 1,5 = 0,015 → 0,02 (yarım yukarı; kayan noktada 0,01'e düşerdi)
    assert.equal(iskontoluFiyat(0.01, 0, 50)!.kdvDahil, 0.02);
    // 2,01 × %50 iskonto = 1,005 → 1,01 (kayan noktada 1,00 olurdu)
    assert.equal(iskontoluFiyat(2.01, 50, 0)!.net, 1.01);
  });

  test("%1 ve %0 KDV, %100 iskonto", () => {
    assert.equal(iskontoluFiyat(138.61, 0, 1)!.kdvDahil, 140);
    assert.equal(iskontoluFiyat(55.55, 10, 0)!.kdvDahil, 50); // 49,995 → 50,00
    assert.deepEqual(iskontoluFiyat(80, 100, 20), { listeNet: 80, listeKdvDahil: 96, net: 0, kdvDahil: 0 });
  });

  test("fiyatı olmayan ürün satılamaz", () => {
    assert.equal(iskontoluFiyat(null, 10, 20), null);
    assert.equal(iskontoluFiyat(0, 10, 20), null);
    assert.equal(iskontoluFiyat(undefined, 10, 20), null);
  });

  test("liste KDV dahil fiyat mevcut katalog hesabıyla aynı", () => {
    for (const [f, k] of [[749.17, 20], [138.61, 1], [99.99, 10], [1234.56, 20], [0.5, 8]] as const) {
      assert.equal(iskontoluFiyat(f, 0, k)!.listeKdvDahil, kdvDahilFiyat(f, k), `${f} / %${k}`);
    }
  });
});

describe("kalemTutariKurus ve toplam", () => {
  test("birim × adet, yarım yukarı", () => {
    assert.equal(kalemTutariKurus(96.25, 3), 288.75);
    assert.equal(kalemTutariKurus(96.25, 2.5), 240.63); // 240,625
    assert.equal(kalemTutariKurus(2.01, 0.5), 1.01); // 1,005
    assert.equal(kalemTutariKurus(0.1, 3), 0.3);
  });

  test("toplam kuruş kaybetmez", () => {
    assert.equal(tutarToplami([0.1, 0.2]), 0.3);
    assert.equal(tutarToplami([288.75, 240.63, 1.01]), 530.39);
    assert.equal(tutarToplami([]), 0);
  });
});
