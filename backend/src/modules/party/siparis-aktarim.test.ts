import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kalemToplami } from "@projelio/shared";
import { parseCsv } from "../ai-assistant/ai-sheet-import";
import {
  karttaEsle,
  siparisPlaniCikar,
  tarihOku,
  tutarOku,
  urunSutunlariniEsle,
  type AktarimBaglami,
  type KatalogUrunu,
} from "./siparis-aktarim";

// İlk gerçek yükleme (CARMED İLAÇ kargo dökümü, 2026-10) bu kurallara
// dayanıyor. Buradaki bir gerileme ya bir pazaryeri alıcısını eczanenin
// cirosuna yazar ya da tutarı olmayan satırı tahmini bir alacak olarak açar.
// Örnek satırlar gerçek dosyanın biçiminde, adlar uydurma.

const KATALOG: KatalogUrunu[] = [
  { id: "u-vacrol", name: "Vacrol 500 MG 30’lu Softgel – Standardize Karvakrol", liste: 899, unit: "adet" },
  { id: "u-vacrolm", name: "Vacrol-M 500 MG 30’lu Softgel – Standardize Karvakrol", liste: 899, unit: "adet" },
  { id: "u-damla", name: "Vacrol Damla 10 ML – Standardize Karvakrol", liste: 899, unit: "adet" },
  { id: "u-smix", name: "S-Mix Damla 10 ML – Standardize Karvakrol", liste: 999, unit: "adet" },
  { id: "u-sprey", name: "Vacrol Sprey 30 ML – Standardize Karvakrol", liste: 525, unit: "adet" },
  { id: "u-sabun", name: "Vacroderm Karvakrol Sabunu", liste: 250, unit: "adet" },
  { id: "u-sabun5", name: "Vacroderm Karvakrol Sabunu 5’li Set", liste: 900, unit: "paket" },
  { id: "u-tuz", name: "Çankırı Kaya Tuzu 500 GR", liste: 140, unit: "adet" },
  { id: "u-paket", name: "Vacrol Kışa Hazırlık Paketi | Pastil, Sprey ve Softgel", liste: 1600, unit: "paket" },
  { id: "u-goz1", name: "Göz Çevresi Bakım Kremi 4 GR", liste: 1499, unit: "adet" },
  { id: "u-goz2", name: "Hydreamer Eyes Göz Çevresi Bakım Kremi 12 ML", liste: 399, unit: "adet" },
];

const CSV = [
  "﻿TARİH;ÇIKIŞ YERİ;İSİM;SOYİSİM;İL ;İLÇE;TUTAR;VACROL;VACROL-M;S-MİX;DAMLA;SPREY;SABUN;TUZ;",
  "15.07.2026;TRENDYOL;ESKİ;SATIR;;;₺899,00;1;;;;;;;",
  "1.08.2026;TRENDYOL;MERVE;ZENGİN;;;₺1.250,00;1;;;;;;;",
  "1.08.2026;ECZ;ŞEYMA KOÇAK;KOÇAK ECZ;;;₺2.577,60;2;;;;1;;;",
  "2.08.2026;ECZ;BAŞAK KOÇAK;BAŞAK ECZ;;;₺1.000,00;;;1;;;;;",
  "3.08.2026;DR;SEDAT;YARDIMCI;İSTANBUL;KADIKÖY;₺2.848,00;;2;;1;;;;",
  "9.08.2026;DR;SEDAT ;YARDIMCI;;;₺1.424,00;;1;;;;;;",
  "4.08.2026;GÜÇLÜ KAL;AYŞE;DEMİR;;;;1;;;;;;;",
  "5.08.2026;GÜÇLÜ KAL;HÜSEYİN;BULUT;;;₺655,00;İPTAL EDİLDİ;;;;;;;",
  "6.08.2026;CPT PRM;CPT MİSAFİRLERİNE;;;;₺0,00;;;;;3;;;",
  "7.08.2026;TRENDYOL;YEŞİM;SALMAK;;;₺1.399,00;;;;;;;;",
  "8.08.2026;ECZ;LÜTFİYE TEPELİ;MAVİ;;;₺3.000,00;1;;;;;;;",
  "1.Haz;TRENDYOL;POLAT;İNAL;;;₺500,00;1;;;;;;;",
  "16.10.2026;;;;;;₺435.405,10;;;;;;;;",
  "16.10.2026;;;;;;;;;;;;;;",
].join("\r\n");

function baglam(over: Partial<AktarimBaglami> = {}): AktarimBaglami {
  return {
    organizationId: "org-1",
    katalog: KATALOG,
    musteriler: [
      { id: "p-kocak", displayName: "Koçak Eczanesi", city: "Denizli" },
      { id: "p-merve", displayName: "Merve Eczanesi", city: "İstanbul" },
      { id: "p-mavi1", displayName: "Mavi Eczanesi (Çiğli)", city: "İzmir" },
      { id: "p-mavi2", displayName: "Mavi Eczanesi (Sarıyer)", city: "İstanbul" },
    ],
    kanallar: [],
    ...over,
  };
}

function plan(d: Parameters<typeof siparisPlaniCikar>[2] = { baslangic: "2026-08-01" }, ctx = baglam()) {
  return siparisPlaniCikar({ name: "s", rows: parseCsv(CSV) }, ctx, d);
}

describe("tutarOku / tarihOku", () => {
  test("Türkçe para biçimleri", () => {
    assert.equal(tutarOku(" ₺12.768,00 "), 12768);
    assert.equal(tutarOku("₺1.411,60"), 1411.6);
    assert.equal(tutarOku("2.323"), 2323);
    assert.equal(tutarOku("2323.5"), 2323.5);
    assert.equal(tutarOku(1250), 1250);
    assert.equal(tutarOku(""), null);
    assert.equal(tutarOku("yok"), null);
  });
  test("tarih biçimleri; geçersiz gün reddedilir", () => {
    assert.equal(tarihOku("1.08.2026"), "2026-08-01");
    assert.equal(tarihOku("01/08/2026"), "2026-08-01");
    assert.equal(tarihOku("2026-08-01"), "2026-08-01");
    assert.equal(tarihOku("31.02.2026"), null);
    assert.equal(tarihOku("1.Haz"), null);
  });
});

describe("urunSutunlariniEsle", () => {
  const e = urunSutunlariniEsle(["VACROL", "VACROL-M", "S-MİX", "DAMLA", "SPREY", "SABUN", "TUZ", "GÖZ KREMİ", "OMEGA 3"], KATALOG);
  test("kısa kelime tam, uzun kelime ön ek olarak eşleşir", () => {
    assert.equal(e.get("VACROL-M")!.productId, "u-vacrolm");
    assert.equal(e.get("TUZ")!.productId, "u-tuz");
  });
  test("tek adaylı başlık bağlanınca ürünü diğerlerinden düşer", () => {
    assert.equal(e.get("S-MİX")!.productId, "u-smix");
    assert.equal(e.get("DAMLA")!.productId, "u-damla");
    assert.equal(e.get("VACROL")!.productId, "u-vacrol");
  });
  test("paket ürün, tekil ürün varken seçilmez", () => {
    assert.equal(e.get("SABUN")!.productId, "u-sabun");
  });
  test("belirsiz başlık bağlanmaz, adaylar döner", () => {
    assert.equal(e.get("GÖZ KREMİ")!.productId, undefined);
    assert.deepEqual(
      e.get("GÖZ KREMİ")!.adaylar.map((u) => u.id),
      ["u-goz1", "u-goz2"]
    );
    assert.equal(e.get("OMEGA 3")!.productId, undefined);
  });
});

describe("karttaEsle", () => {
  const anahtarlar = [
    { musteri: { id: "k", displayName: "Koçak Eczanesi" }, kelimeler: ["kocak"], semt: [] },
    { musteri: { id: "yb", displayName: "Yeni Bağlıca Eczanesi" }, kelimeler: ["yeni", "baglica"], semt: [] },
    { musteri: { id: "y", displayName: "Yeni Eczanesi (Levent)" }, kelimeler: ["yeni"], semt: ["levent"] },
  ];
  test("belirteçten önceki kelimeler kart adıyla bitmeli", () => {
    assert.equal(karttaEsle({ kelimeler: ["seyma", "kocak", "kocak", "ecz"], yer: [] }, anahtarlar, false)!.adaylar[0].id, "k");
    // Eczane "Başak", soyadı Koçak: Koçak Eczanesi DEĞİL.
    assert.equal(karttaEsle({ kelimeler: ["basak", "kocak", "basak", "ecz"], yer: [] }, anahtarlar, false), null);
  });
  test("en uzun eşleşen ad kazanır", () => {
    const e = karttaEsle({ kelimeler: ["nursel", "izgi", "yeni", "baglica", "ecz"], yer: [] }, anahtarlar, false)!;
    assert.deepEqual(e.adaylar.map((m) => m.id), ["yb"]);
    assert.equal(e.guven, "kesin");
  });
  test("belirteç yoksa yalnızca eczane kanalında ve olası", () => {
    assert.equal(karttaEsle({ kelimeler: ["merve", "kocak"], yer: [] }, anahtarlar, false), null);
    assert.equal(karttaEsle({ kelimeler: ["merve", "kocak"], yer: [] }, anahtarlar, true)!.guven, "olasi");
    // Tek kelime eczacının adıdır, eczane değil.
    assert.equal(karttaEsle({ kelimeler: ["kocak"], yer: [] }, anahtarlar, true), null);
  });
});

describe("siparisPlaniCikar", () => {
  test("başlangıçtan önceki satırlar sayılır, listelenmez", () => {
    const p = plan();
    assert.equal(p.oncekiSatir, 1);
    assert.ok(!p.atlanan.some((a) => a.ozet.includes("ESKİ")));
  });

  test("atlama nedenleri", () => {
    const n = Object.fromEntries(plan().atlanan.map((a) => [a.satir, a.neden]));
    assert.equal(n[8], "Tutar yok");
    assert.match(n[9], /Adet okunamadı: "İPTAL EDİLDİ"/);
    assert.equal(n[10], "Satış dışı (numune / misafir / iptal)");
    assert.equal(n[11], "Ürün yok");
    assert.equal(n[13], "Tarih okunamadı");
    assert.equal(n[14], "Toplam satırı");
    // Yalnızca tarihi olan boş satır sessizce geçilir.
    assert.equal(n[15], undefined);
  });

  test("pazaryeri alıcısı eczaneye yazılmaz, eczane eşleşmesi kesin", () => {
    const a = new Map(plan().alicilar.map((x) => [x.anahtar, x]));
    assert.equal(a.get("merve zengin")!.karar, "kanal");
    assert.equal(a.get("seyma kocak kocak ecz")!.karar, "mevcut");
    assert.equal(a.get("seyma kocak kocak ecz")!.partyId, "p-kocak");
    assert.equal(a.get("basak kocak basak ecz")!.karar, "kanal");
  });

  test("aynı adlı kartlar arasında belirsizlik yeni kart açmaz", () => {
    const a = plan().alicilar.find((x) => x.anahtar === "lutfiye tepeli mavi")!;
    assert.equal(a.guven, "belirsiz");
    assert.equal(a.karar, "kanal");
    assert.equal(a.adaylar!.length, 2);
  });

  test("2+ siparişli eşleşmeyen alıcı yeni kart (boşluk farkı aynı kişi)", () => {
    const a = plan().alicilar.find((x) => x.anahtar === "sedat yardimci")!;
    assert.equal(a.karar, "yeni");
    assert.equal(a.siparisSayisi, 2);
    assert.equal(a.yeniKartAdi, "Sedat Yardımcı");
  });

  test("tutar esas: kalemler katalog oranında, toplam tam", () => {
    const p = plan();
    for (const s of p.siparisler) assert.equal(kalemToplami(s.kalemler), s.siparis.tutar);
    const kocak = p.siparisler.find((s) => s.anahtar === "seyma kocak kocak ecz")!;
    // 2 × 899 + 1 × 525 = 2.323 liste; 2.577,60 tutar liste oranında paylaşılır.
    assert.equal(kocak.kalemler.length, 2);
    assert.equal(kocak.kalemler[0].product_id, "u-vacrol");
    assert.equal(kocak.kalemler[0].liste_birim_fiyat, 899);
    assert.equal(kocak.kalemler[0].tutar, 1995.06);
    assert.equal(kocak.kalemler[1].tutar, 582.54);
  });

  test("kanal türü ve vadesi tahmin edilir, düzeltme uygulanır", () => {
    const p = plan({ baslangic: "2026-08-01", kanallar: { "GÜÇLÜ KAL": { tur: "web", vadeGun: 0 } } });
    const k = new Map(p.kanallar.map((x) => [x.ad, x]));
    assert.equal(k.get("TRENDYOL")!.tur, "pazaryeri");
    assert.equal(k.get("TRENDYOL")!.vadeGun, 30);
    assert.equal(k.get("ECZ")!.vadeGun, 60);
    assert.equal(k.get("DR")!.tur, "doktor");
    const s = p.siparisler.find((x) => x.kanalAdi === "ECZ")!;
    assert.equal(s.siparis.vade_gun, 60);
  });

  test("düzeltmeler: alıcı kararı, ürün sütunu alma", () => {
    const p = plan({
      baslangic: "2026-08-01",
      alicilar: { "lutfiye tepeli mavi": { karar: "mevcut", partyId: "p-mavi2" }, "merve zengin": { karar: "atla" } },
      urunSutunlari: { SPREY: null },
    });
    const a = p.alicilar.find((x) => x.anahtar === "lutfiye tepeli mavi")!;
    assert.equal(a.partyAdi, "Mavi Eczanesi (Sarıyer)");
    assert.ok(!p.siparisler.some((s) => s.anahtar === "merve zengin"));
    const kocak = p.siparisler.find((s) => s.anahtar === "seyma kocak kocak ecz")!;
    assert.equal(kocak.kalemler.length, 1);
    assert.equal(kocak.kalemler[0].tutar, 2577.6);
  });

  test("dış kimlik kararlı: aynı dosya aynı kimlikleri üretir", () => {
    const a = plan().siparisler.map((s) => s.siparis.dis_kimlik);
    const b = plan().siparisler.map((s) => s.siparis.dis_kimlik);
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, a.length);
  });

  test("başlık yoksa açık hata", () => {
    assert.throws(() => siparisPlaniCikar({ name: "s", rows: [["a", "b"]] }, baglam()), /Başlık satırı bulunamadı/);
  });
});
