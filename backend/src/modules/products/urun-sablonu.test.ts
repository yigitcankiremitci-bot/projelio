// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tabloyuOku } from "../party/musteri-sablonu";
import {
  mevcutUrunleriAyikla,
  planUrunImport,
  sayiCoz,
  URUN_SUTUNLARI,
  urunSablonuOlustur,
  urunSayfasiniSec,
  urunSutunlariniBul,
} from "./urun-sablonu";

// Asıl sınanan şey şablon ile okuyucunun birbirini TANIMASI: başlık
// tanınmazsa o sütun sessizce yazılmaz, kullanıcı ancak kartlara bakınca
// fark eder.

const sayfa = (rows: string[][]) => ({ name: "Ürünler", rows });

describe("ürün şablonu — üret ve geri oku", () => {
  for (const dil of ["tr", "en"] as const) {
    test(`${dil}: şablonun her sütunu tanınır, veri sayfası ilk sırada ve boş`, async () => {
      const sayfalar = await tabloyuOku(await urunSablonuOlustur(dil), "sablon.xlsx");
      const veri = urunSayfasiniSec(sayfalar)!;
      assert.equal(veri.name, dil === "tr" ? "Ürünler" : "Products");
      // Yalnızca başlık satırı: örnek satır rehber sayfasında durur.
      assert.equal(veri.rows.length, 1);
      assert.equal(urunSutunlariniBul(veri.rows[0]).size, URUN_SUTUNLARI.length);
    });
  }
});

describe("sütun eşleşmesi", () => {
  test("'Stok kodu' stok miktarına, 'KDV' parantezsiz de tanınır", () => {
    const s = urunSutunlariniBul(["Ürün Adı", "Stok Kodu", "Stok", "KDV", "Satış Fiyatı"]);
    assert.equal(s.get("name"), 0);
    assert.equal(s.get("sku"), 1);
    assert.equal(s.get("stockQuantity"), 2);
    assert.equal(s.get("taxRate"), 3);
    assert.equal(s.get("price"), 4);
  });
});

describe("sayiCoz", () => {
  test("Türkçe ve İngilizce yazımlar", () => {
    assert.equal(sayiCoz("1.250,50"), 1250.5);
    assert.equal(sayiCoz("1,250.50"), 1250.5);
    assert.equal(sayiCoz("450,75 TL"), 450.75);
    assert.equal(sayiCoz("₺450"), 450);
    assert.equal(sayiCoz("%20"), 20);
    assert.equal(sayiCoz("1.250.000"), 1250000);
    assert.equal(sayiCoz("-3"), -3);
    assert.equal(sayiCoz("yok"), undefined);
  });

  test("sayı hücresinden gelen '2.125' bin katına çıkmaz", () => {
    assert.equal(sayiCoz("2.125"), 2.125);
  });
});

describe("planUrunImport", () => {
  test("etiketler koda çevrilir, tanınmayan değer uyarı olur ama ürünü düşürmez", () => {
    const plan = planUrunImport(
      sayfa([
        ["Ad", "Tür", "Birim", "Fiyat", "Para birimi", "KDV (%)", "Öne çıkan özellikler", "Barkod"],
        ["Termos", "Ürün", "Adet", "1.250,50", "TL", "0.2", "Sızdırmaz; BPA yok", "0869"],
        ["Kurulum", "Hizmet", "saat", "500", "", "", "", ""],
        ["", "Ürün", "", "", "", "", "", ""],
        ["Kupa", "Eşya", "Adt", "pahalı", "Yen", "", "", ""],
      ])
    );
    assert.equal(plan.toplamSatir, 4);
    assert.deepEqual(plan.atlanan, [{ satir: 4, sebep: "ad boş" }]);
    const [termos, kurulum, kupa] = plan.planlanan;
    assert.deepEqual(termos.urun, {
      name: "Termos",
      kind: "product",
      unit: "adet",
      price: 1250.5,
      currency: "TRY",
      taxRate: 20,
      features: ["Sızdırmaz", "BPA yok"],
      barcode: "0869",
    });
    assert.equal(kurulum.urun.kind, "service");
    assert.equal(kurulum.urun.unit, "saat");
    assert.deepEqual(kupa.urun, { name: "Kupa" });
    assert.equal(plan.uyarilar.filter((u) => u.satir === 5).length, 4);
  });

  test("Ad sütunu yoksa hiçbir şey planlanmaz", () => {
    const plan = planUrunImport(sayfa([["Fiyat"], ["10"]]));
    assert.equal(plan.planlanan.length, 0);
    assert.equal(plan.atlanan.length, 1);
  });
});

describe("mevcutUrunleriAyikla", () => {
  const p = (satir: number, name: string, sku?: string, barcode?: string) => ({ satir, urun: { name, sku, barcode } });

  test("stok kodu, barkod ve (kodsuzsa) ad ile eşleşir; dosya içi tekrar da ayıklanır", () => {
    const { yeni, zatenVar } = mevcutUrunleriAyikla(
      [p(2, "Termos", "trm-500"), p(3, "Kupa", undefined, "111"), p(4, "Tabak"), p(5, "Tabak"), p(6, "Bardak")],
      [
        { name: "Eski termos", sku: "TRM-500" },
        { name: "Kupa eski", barcode: "111" },
        { name: "tabak", archivedAt: "2026-01-01" },
      ]
    );
    assert.deepEqual(
      zatenVar.map((z) => [z.satir, z.neden]),
      [
        [2, "aynı stok kodu"],
        [3, "aynı barkod"],
        [4, "aynı ad"],
        [5, "aynı ad"],
      ]
    );
    assert.deepEqual(yeni.map((y) => y.satir), [6]);
  });

  test("aynı adlı ama farklı stok kodlu varyantlar ayrı ürün sayılır", () => {
    const { yeni } = mevcutUrunleriAyikla([p(2, "Tişört", "TS-S"), p(3, "Tişört", "TS-M")], [{ name: "Tişört", sku: "TS-L" }]);
    assert.equal(yeni.length, 2);
  });

  test("'1.5 L' ile '15 L' aynı ad sayılmaz", () => {
    const { yeni } = mevcutUrunleriAyikla([p(2, "Su 1.5 L")], [{ name: "Su 15 L" }]);
    assert.equal(yeni.length, 1);
  });
});
