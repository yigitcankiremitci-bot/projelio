import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Product } from "@projelio/shared";
import { aramaBicimi, BOS_FILTRE, filtreleUrunler, kovalar, siralaUrunler, urunlerCsv } from "./urunListesi";

function urun(p: Partial<Product> & { id: string; name: string }): Product {
  return {
    organizationId: "o",
    status: "active",
    kind: "product",
    features: [],
    specs: [],
    sortOrder: 0,
    createdAt: "2026-11-01T00:00:00Z",
    ...p,
  };
}

const liste = [
  urun({ id: "1", name: "Şampuan Bebek", brand: "TARKO", category: "Kozmetik", price: 50, stockQuantity: 0, sku: "TR-1" }),
  urun({ id: "2", name: "Eldiven Nitril", brand: "KURTSAN", category: "Medikal", price: 120, stockQuantity: 3, minStock: 5, barcode: "8690001" }),
  urun({ id: "3", name: "Bebek Bezi", brand: "TARKO", price: undefined, stockQuantity: 40, createdAt: "2026-11-05T00:00:00Z" }),
  urun({ id: "4", name: "Kurulum hizmeti", kind: "service", category: "Medikal", price: 900 }),
];

describe("aramaBicimi", () => {
  test("Türkçe harfler ve büyük İ aksansız küçük harfe iner", () => {
    assert.equal(aramaBicimi("  ŞAMPUAN  İTRİYAT ığ "), "sampuan itriyat ig");
  });
});

describe("filtreleUrunler", () => {
  test("arama aksansız ve kelime kelime (VE)", () => {
    assert.deepEqual(filtreleUrunler(liste, { ...BOS_FILTRE, arama: "sampuan bebek" }).map((p) => p.id), ["1"]);
    assert.deepEqual(filtreleUrunler(liste, { ...BOS_FILTRE, arama: "tarko" }).map((p) => p.id), ["1", "3"]);
  });

  test("barkodla bulunur", () => {
    assert.deepEqual(filtreleUrunler(liste, { ...BOS_FILTRE, arama: "8690001" }).map((p) => p.id), ["2"]);
  });

  test("stok kovaları: tükendi, kritik; hizmet stok filtresine girmez", () => {
    assert.deepEqual(filtreleUrunler(liste, { ...BOS_FILTRE, stok: "tukendi" }).map((p) => p.id), ["1"]);
    assert.deepEqual(filtreleUrunler(liste, { ...BOS_FILTRE, stok: "kritik" }).map((p) => p.id), ["2"]);
    assert.deepEqual(filtreleUrunler(liste, { ...BOS_FILTRE, stok: "girilmemis" }).map((p) => p.id), []);
  });

  test("kategorisiz kovası boş dizeyle seçilir", () => {
    assert.deepEqual(filtreleUrunler(liste, { ...BOS_FILTRE, kategoriler: [""] }).map((p) => p.id), ["3"]);
  });

  test("fiyat aralığı fiyatı girilmemiş ürünü dışarıda bırakır", () => {
    assert.deepEqual(filtreleUrunler(liste, { ...BOS_FILTRE, fiyatMin: 100 }).map((p) => p.id), ["2", "4"]);
  });
});

describe("siralaUrunler", () => {
  test("fiyat sıralamasında fiyatsız ürün her iki yönde de sonda", () => {
    assert.deepEqual(siralaUrunler(liste, "fiyat-artan").map((p) => p.id), ["1", "2", "4", "3"]);
    assert.deepEqual(siralaUrunler(liste, "fiyat-azalan").map((p) => p.id), ["4", "2", "1", "3"]);
  });

  test("Türkçe alfabe: Ş, S'den sonra gelir", () => {
    assert.deepEqual(siralaUrunler(liste, "ad-artan").map((p) => p.name[0]), ["B", "E", "K", "Ş"]);
  });

  test("aramada önerilen sıra: adı aranan kelimeyle başlayan önce", () => {
    assert.deepEqual(siralaUrunler(filtreleUrunler(liste, { ...BOS_FILTRE, arama: "bebek" }), "varsayilan", "bebek").map((p) => p.id), [
      "3",
      "1",
    ]);
  });
});

describe("kovalar", () => {
  test("marka seçiliyken marka listesi yine bütün markaları sayar, kategori listesi daralır", () => {
    const k = kovalar(liste, { ...BOS_FILTRE, markalar: ["KURTSAN"] });
    assert.deepEqual(k.markalar.map((m) => [m.deger, m.sayi]), [["TARKO", 2], ["KURTSAN", 1], ["", 1]]);
    assert.deepEqual(k.kategoriler.map((m) => [m.deger, m.sayi]), [["Medikal", 1]]);
  });
});

describe("urunlerCsv", () => {
  test("BOM, noktalı virgül ve ondalık virgül", () => {
    const csv = urunlerCsv([urun({ id: "x", name: 'A;"B"', price: 12.5 })], ["Ad"]);
    assert.ok(csv.startsWith("﻿Ad\r\n"));
    assert.ok(csv.includes('"A;""B"""'));
    assert.ok(csv.includes(";12,5;"));
  });
});
