import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tlFiyat } from "@projelio/shared";
import { CREDIT_UNIT_USD, creditPackagesAt, findCreditPackage } from "./ai-credits.config";

// Bu testler tasarımı değil PARA'yı korur. Paket fiyatı, Lio'nun kredi düşerken
// kullandığı ekonomiyle (CREDIT_UNIT_USD) ve aboneliklerle AYNI kur/yuvarlama
// hesabından türetilmek zorunda: biri değişip diğeri unutulursa Projelio krediyi
// maliyetinin altına satar ya da iki ekranda iki fiyat görünür.

const KUR = 48.7479; // 2026-09-18 admin panelindeki kur

describe("kredi paketi fiyatlaması", () => {
  test("fiyat = birim × CREDIT_UNIT_USD × kur, 10 ₺'ye yukarı — aboneliklerle aynı hesap", () => {
    for (const pkg of creditPackagesAt(KUR)) {
      assert.equal(pkg.priceTry, tlFiyat(pkg.credits * CREDIT_UNIT_USD, KUR), `${pkg.key} paketinin fiyatı sapmış`);
    }
  });

  test("bilinen kurla bilinen fiyatlar", () => {
    const fiyat = Object.fromEntries(creditPackagesAt(KUR).map((p) => [p.key, p.priceTry]));
    assert.deepEqual(fiyat, { mini: 130, standart: 250, profesyonel: 740, kurumsal: 2440 });
  });

  test("yuvarlama hep YUKARI: hiçbir paket maliyetinin altına satılmaz", () => {
    for (const pkg of creditPackagesAt(KUR)) {
      assert.ok(pkg.priceTry >= pkg.credits * CREDIT_UNIT_USD * KUR, `${pkg.key} maliyetin altında`);
    }
  });

  test("kur yoksa satış yok — uydurma bir kurla fiyat üretilmez", () => {
    assert.deepEqual(creditPackagesAt(null), []);
    assert.equal(findCreditPackage("mini", null), undefined);
  });

  test("her paket pozitif kredi ve pozitif fiyat taşır", () => {
    const paketler = creditPackagesAt(KUR);
    assert.ok(paketler.length > 0, "hiç paket tanımlı değil");
    for (const pkg of paketler) {
      assert.ok(pkg.credits > 0, `${pkg.key} kredisi pozitif değil`);
      assert.ok(pkg.priceTry > 0, `${pkg.key} fiyatı pozitif değil — bedava kredi satılamaz`);
    }
  });

  test("paket anahtarları benzersiz — sipariş yanlış pakete bağlanmasın", () => {
    const anahtarlar = creditPackagesAt(KUR).map((p) => p.key);
    assert.equal(new Set(anahtarlar).size, anahtarlar.length);
  });

  test("bilinmeyen paket anahtarı bulunmaz", () => {
    // Sipariş oluşturma bu kontrole dayanıyor: istemci uydurma bir anahtar
    // gönderirse sipariş açılmamalı.
    assert.equal(findCreditPackage("boyle-bir-paket-yok", KUR), undefined);
    assert.ok(findCreditPackage("mini", KUR));
  });
});
