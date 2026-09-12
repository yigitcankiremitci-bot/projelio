import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ModuleRecord } from "./types";
import { urunIliskiliKayitlar, urunKaydiEslesir } from "./urunIliskileri";

function kayit(moduleKey: string, data: Record<string, unknown>, ek: Partial<ModuleRecord> = {}): ModuleRecord {
  return { id: `${moduleKey}-${JSON.stringify(data)}`, moduleKey, data, createdAt: "2026-09-01", ...ek };
}

describe("urunKaydiEslesir", () => {
  const sandalye = { name: "Ahşap Sandalye", sku: "SND-01" };

  test("ad birebir yazılmışsa eşleşir, büyük/küçük harf fark etmez", () => {
    assert.equal(urunKaydiEslesir(sandalye, "oud_tedarik", { itemName: "ahşap sandalye" }), "name");
  });

  test("Türkçe büyük İ doğru küçülür", () => {
    assert.equal(urunKaydiEslesir({ name: "İpek Şal" }, "oud_depo", { itemName: "ipek şal" }), "name");
  });

  test("ad daha uzun bir metnin içinde kelime olarak geçiyorsa eşleşir", () => {
    assert.equal(
      urunKaydiEslesir(sandalye, "oud_sevkiyat_yonetimi", { itemSummary: "12 adet Ahşap  Sandalye, 3 koli" }),
      "name"
    );
  });

  test("stok kodu addan önce gelir", () => {
    assert.equal(urunKaydiEslesir(sandalye, "oud_depo", { itemName: "Ahşap Sandalye", sku: "snd-01" }), "sku");
  });

  test("kelimenin parçası eşleşme sayılmaz", () => {
    assert.equal(urunKaydiEslesir({ name: "Masa" }, "oud_tedarik", { itemName: "Masaüstü bilgisayar" }), null);
  });

  test("çok kısa ad aranmaz", () => {
    assert.equal(urunKaydiEslesir({ name: "Su" }, "oud_tedarik", { itemName: "Su" }), null);
  });

  test("ürünü anlatmayan alanlara bakılmaz", () => {
    assert.equal(urunKaydiEslesir(sandalye, "oud_tedarik", { itemName: "Vida", notes: "Ahşap Sandalye için" }), null);
  });

  test("listede olmayan modül hiç eşleşmez", () => {
    assert.equal(urunKaydiEslesir(sandalye, "ik_bordro_ozluk", { itemName: "Ahşap Sandalye" }), null);
  });

  test("düzenli ifade karakterleri kaçırılır", () => {
    assert.equal(urunKaydiEslesir({ name: "C++ Kursu" }, "pd_reklam", { campaignName: "Eylül C++ Kursu kampanyası" }), "name");
    assert.equal(urunKaydiEslesir({ name: "a.b ürün" }, "pd_reklam", { campaignName: "axb ürün" }), null);
  });
});

describe("urunIliskiliKayitlar", () => {
  const urun = { id: "u1", name: "Ahşap Sandalye", sku: "SND-01" };

  test("kimlikle bağlı strateji kaydı ilişkili listeye girmez", () => {
    const sonuc = urunIliskiliKayitlar(urun, [
      kayit("pd_urun_stratejileri", { productName: "Ahşap Sandalye" }, { scopeRef: "u1" }),
    ]);
    assert.equal(sonuc.length, 0);
  });

  test("modül sırasına göre dizilir: depo tedarikten önce", () => {
    const sonuc = urunIliskiliKayitlar(urun, [
      kayit("oud_tedarik", { itemName: "Ahşap Sandalye" }),
      kayit("mid_sikayet_oneri", { description: "Ahşap sandalye kırıldı" }),
      kayit("oud_depo", { itemName: "Sandalye", sku: "SND-01" }),
    ]);
    assert.deepEqual(
      sonuc.map((s) => [s.record.moduleKey, s.matchedBy]),
      [
        ["oud_depo", "sku"],
        ["oud_tedarik", "name"],
        ["mid_sikayet_oneri", "name"],
      ]
    );
  });
});
