import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kalemleriOrantila, kalemToplami, kalemTutari, katalogSapmasi, kdvDahilFiyat } from "./siparisKalemleri";

// Kalem toplamı siparişin tutarına kuruşu kuruşuna eşit olmalı: ürün
// kartındaki ciro ile tahsilat raporu buradan ayrışır.

describe("kalemleriOrantila", () => {
  test("katalog tutarı oranında dağıtır, toplam tam tutar", () => {
    const k = kalemleriOrantila(
      [
        { miktar: 1, listeBirimFiyat: 899 },
        { miktar: 2, listeBirimFiyat: 525 },
      ],
      2427.3
    );
    assert.equal(kalemToplami(k), 2427.3);
    // 899 / 1949 payı
    assert.equal(k[0].tutar, 1119.62);
    assert.equal(k[1].tutar, 1307.68);
    assert.equal(k[1].birimFiyat, 653.84);
  });

  test("yuvarlama artığı en büyük paylı kaleme gider", () => {
    const k = kalemleriOrantila(
      [
        { miktar: 1, listeBirimFiyat: 100 },
        { miktar: 1, listeBirimFiyat: 100 },
        { miktar: 1, listeBirimFiyat: 100 },
      ],
      1000
    );
    assert.deepEqual(
      k.map((x) => x.tutar),
      [333.34, 333.33, 333.33]
    );
    assert.equal(kalemToplami(k), 1000);
  });

  test("katalog fiyatı eksikse miktar oranında dağıtır", () => {
    const k = kalemleriOrantila(
      [
        { miktar: 3, listeBirimFiyat: 100 },
        { miktar: 1, listeBirimFiyat: undefined },
      ],
      400
    );
    assert.deepEqual(
      k.map((x) => x.tutar),
      [300, 100]
    );
  });

  test("sıfır fiyatlı kalem pay almaz", () => {
    const k = kalemleriOrantila(
      [
        { miktar: 1, listeBirimFiyat: 100 },
        { miktar: 1, listeBirimFiyat: 0 },
      ],
      120
    );
    assert.deepEqual(
      k.map((x) => x.tutar),
      [120, 0]
    );
  });

  test("boş liste", () => {
    assert.deepEqual(kalemleriOrantila([], 100), []);
  });
});

describe("katalogSapmasi", () => {
  test("pazaryeri pahalı, eczane indirimli", () => {
    assert.equal(katalogSapmasi([{ miktar: 1, listeBirimFiyat: 899, tutar: 1250 }]), 0.39);
    assert.equal(katalogSapmasi([{ miktar: 2, listeBirimFiyat: 500, tutar: 700 }]), -0.3);
  });
  test("fiyatı eksik kalem varsa hesaplanmaz", () => {
    assert.equal(katalogSapmasi([{ miktar: 1, listeBirimFiyat: 899, tutar: 1 }, { miktar: 1, tutar: 1 }]), undefined);
  });
});

describe("kdvDahilFiyat ve kalemTutari", () => {
  test("katalog KDV hariç; satış KDV dahil", () => {
    assert.equal(kdvDahilFiyat(749.17, 20), 899);
    assert.equal(kdvDahilFiyat(138.61, 1), 140);
    assert.equal(kdvDahilFiyat(0, 20), undefined);
    assert.equal(kdvDahilFiyat(null, 20), undefined);
  });
  test("miktar × birim fiyat", () => {
    assert.equal(kalemTutari({ miktar: 3, birimFiyat: 333.3333 }), 1000);
  });
});
