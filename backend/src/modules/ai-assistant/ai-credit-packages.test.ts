import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tlFiyat } from "@projelio/shared";
import { PLANS } from "../billing/billing.plans";
import { CREDIT_UNIT_USD, EK_BAKIYE_CARPANI, creditPackagesAt, creditsToUsd, findCreditPackage } from "./ai-credits.config";

// Bu testler tasarımı değil PARA'yı ve KURGUYU korur:
//   · ek bakiye aboneliğin YERİNE geçemez — birim fiyatı her abonelikten pahalı
//   · Lio'nun iç maliyetinin (CREDIT_UNIT_USD) altına satılamaz
//   · TL hesabı aboneliklerle aynı (shared/tlFiyat)
// 2026-09'da paket aboneliğin 2,5 kat altındaydı: abone olmadan Lio kullanmak
// daha ucuzdu. Bu dosya o hatanın geri gelmesini engelliyor.

const KUR = 48.7479; // 2026-09-18 admin panelindeki kur

describe("ek bakiye fiyatlaması", () => {
  test("birim fiyatı HER abonelikten pahalı — ek bakiye aboneliğin yerine geçemez", () => {
    for (const plan of PLANS.filter((p) => p.priceUsdMonthly > 0 && p.monthlyCredits > 0)) {
      const planBirim = plan.priceUsdMonthly / plan.monthlyCredits;
      for (const pkg of creditPackagesAt(KUR)) {
        const paketBirim = creditsToUsd(pkg.credits) / pkg.credits;
        assert.ok(paketBirim > planBirim, `${pkg.key}, ${plan.key} aboneliğinden ucuz`);
      }
    }
  });

  test("birim fiyatı en pahalı aboneliğin çarpan katı", () => {
    const starter = PLANS.find((p) => p.key === "starter")!;
    const beklenen = (starter.priceUsdMonthly / starter.monthlyCredits) * EK_BAKIYE_CARPANI;
    assert.ok(Math.abs(creditsToUsd(1) - beklenen) < 1e-12);
  });

  test("Lio'nun iç maliyetinin altına satılmaz", () => {
    for (const pkg of creditPackagesAt(KUR)) {
      assert.ok(pkg.priceTry >= pkg.credits * CREDIT_UNIT_USD * KUR, `${pkg.key} maliyetin altında`);
    }
  });

  test("TL fiyatı aboneliklerle aynı hesaptan (USD × kur, 10 ₺'ye yukarı)", () => {
    for (const pkg of creditPackagesAt(KUR)) {
      assert.equal(pkg.priceTry, tlFiyat(creditsToUsd(pkg.credits), KUR));
    }
  });

  test("bilinen kurla bilinen fiyatlar", () => {
    const fiyat = Object.fromEntries(creditPackagesAt(KUR).map((p) => [p.key, p.priceTry]));
    assert.deepEqual(fiyat, { "ek-10": 190, "ek-25": 460, "ek-50": 920 });
  });

  test("kur yoksa satış yok — uydurma bir kurla fiyat üretilmez", () => {
    assert.deepEqual(creditPackagesAt(null), []);
    assert.equal(findCreditPackage("ek-10", null), undefined);
  });

  test("paket anahtarları benzersiz ve bilinmeyen anahtar bulunmaz", () => {
    const anahtarlar = creditPackagesAt(KUR).map((p) => p.key);
    assert.equal(new Set(anahtarlar).size, anahtarlar.length);
    assert.equal(findCreditPackage("mini", KUR), undefined);
    assert.ok(findCreditPackage("ek-10", KUR));
  });
});
