import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CREDIT_PACKAGES,
  CREDIT_UNIT_USD,
  USD_TRY_RATE,
  creditsToTry,
  findCreditPackage,
} from "./ai-credits.config";

// Bu testler tasarımı değil PARA'yı korur. Paket fiyatı, Lio'nun kredi düşerken
// kullandığı ekonomiyle (CREDIT_UNIT_USD) aynı kaynaktan türetilmek zorunda:
// biri değişip diğeri unutulursa Projelio krediyi maliyetinin altına satar ve
// bu, kullanım arttıkça büyüyen sessiz bir zarar olur.

describe("kredi paketi fiyatlaması", () => {
  test("fiyat, kredi ekonomisinden türetilir — sabit yazılmaz", () => {
    for (const pkg of CREDIT_PACKAGES) {
      const beklenen = Math.round(pkg.credits * CREDIT_UNIT_USD * USD_TRY_RATE * 100) / 100;
      assert.equal(pkg.priceTry, beklenen, `${pkg.key} paketinin fiyatı ekonomiden sapmış`);
    }
  });

  test("birim fiyat paketten pakete aynı — gizli indirim/zam yok", () => {
    // Kademeli indirim bilinçli olarak yok (bkz. CREDIT_PACKAGES yorumu). Eklenirse
    // bu test kırılır ve kararın bilerek alınmış olması gerektiğini hatırlatır.
    const birimFiyatlar = CREDIT_PACKAGES.map((p) => p.priceTry / p.credits);
    for (const birim of birimFiyatlar) {
      assert.ok(Math.abs(birim - birimFiyatlar[0]) < 1e-9, "paketler arasında birim fiyat farkı var");
    }
  });

  test("her paket pozitif kredi ve pozitif fiyat taşır", () => {
    assert.ok(CREDIT_PACKAGES.length > 0, "hiç paket tanımlı değil");
    for (const pkg of CREDIT_PACKAGES) {
      assert.ok(pkg.credits > 0, `${pkg.key} kredisi pozitif değil`);
      assert.ok(pkg.priceTry > 0, `${pkg.key} fiyatı pozitif değil — bedava kredi satılamaz`);
    }
  });

  test("paket anahtarları benzersiz — sipariş yanlış pakete bağlanmasın", () => {
    const anahtarlar = CREDIT_PACKAGES.map((p) => p.key);
    assert.equal(new Set(anahtarlar).size, anahtarlar.length);
  });

  test("bilinmeyen paket anahtarı bulunmaz", () => {
    // Sipariş oluşturma bu kontrole dayanıyor: istemci uydurma bir anahtar
    // gönderirse sipariş açılmamalı.
    assert.equal(findCreditPackage("boyle-bir-paket-yok"), undefined);
    assert.ok(findCreditPackage(CREDIT_PACKAGES[0].key));
  });

  test("creditsToTry iki ondalığa yuvarlar — kuruş altı artık kalmaz", () => {
    assert.equal(creditsToTry(0), 0);
    const fiyat = creditsToTry(12_345);
    assert.equal(Math.round(fiyat * 100) / 100, fiyat);
  });
});
