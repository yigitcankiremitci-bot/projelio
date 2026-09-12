import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { birimKar, brutKarMarji, kartDolulugu, kdvDahilFiyat, stokDurumu } from "./urunKarti";

describe("brutKarMarji", () => {
  test("fiyat ve maliyetten yüzde üretir", () => {
    assert.equal(brutKarMarji(200, 150), 25);
  });

  test("maliyet fiyatı aşarsa negatif", () => {
    assert.equal(brutKarMarji(100, 120), -20);
  });

  test("fiyat sıfırsa ya da eksikse hesaplanmaz", () => {
    assert.equal(brutKarMarji(0, 10), null);
    assert.equal(brutKarMarji(undefined, 10), null);
    assert.equal(brutKarMarji(100, undefined), null);
  });

  test("maliyeti sıfır olan ürün tam marj", () => {
    assert.equal(brutKarMarji(80, 0), 100);
    assert.equal(birimKar(80, 0), 80);
  });
});

describe("kdvDahilFiyat", () => {
  test("oranı ekler ve kuruşa yuvarlar", () => {
    assert.equal(kdvDahilFiyat(99.99, 20), 119.99);
  });

  test("oran girilmemişse hesaplanmaz, sıfır oran ise fiyatın kendisi", () => {
    assert.equal(kdvDahilFiyat(100, undefined), null);
    assert.equal(kdvDahilFiyat(100, 0), 100);
  });
});

describe("stokDurumu", () => {
  test("stok girilmemişse durum yok", () => {
    assert.equal(stokDurumu(undefined, 5), "yok");
  });

  test("sıfır ve eksi stok tükendi", () => {
    assert.equal(stokDurumu(0, 5), "tukendi");
    assert.equal(stokDurumu(-2), "tukendi");
  });

  test("eşik dahil kritik", () => {
    assert.equal(stokDurumu(5, 5), "kritik");
    assert.equal(stokDurumu(6, 5), "yeterli");
  });

  test("eşik yoksa kritik üretilmez", () => {
    assert.equal(stokDurumu(1), "yeterli");
  });
});

describe("kartDolulugu", () => {
  const bos = { kind: "product" as const, features: [], specs: [], images: [] };

  test("hizmette stok ve teknik özellik aranmaz", () => {
    const etiketler = kartDolulugu({ ...bos, kind: "service" }, { enabled: false, yazili: false }).map((m) => m.etiket);
    assert.ok(!etiketler.includes("Stok miktarı"));
    assert.ok(!etiketler.includes("Teknik özellikler"));
  });

  test("strateji yalnızca modül açıksa sayılır", () => {
    assert.ok(!kartDolulugu(bos, { enabled: false, yazili: false }).some((m) => m.etiket === "Ürün stratejisi"));
    const madde = kartDolulugu(bos, { enabled: true, yazili: true }).find((m) => m.etiket === "Ürün stratejisi");
    assert.equal(madde?.tamam, true);
  });

  test("sıfır fiyat girilmiş sayılır, boşluktan oluşan açıklama sayılmaz", () => {
    const liste = kartDolulugu({ ...bos, price: 0, description: "   " }, { enabled: false, yazili: false });
    assert.equal(liste.find((m) => m.etiket === "Satış fiyatı")?.tamam, true);
    assert.equal(liste.find((m) => m.etiket === "Açıklama")?.tamam, false);
  });
});
