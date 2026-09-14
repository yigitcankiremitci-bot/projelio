import type { OdemeSaglayici, PlanRef } from "./billing-settings.service";
import type { BillingPeriod, PlanKey } from "./billing.plans";

export interface MagazaUrunu {
  provider: OdemeSaglayici;
  planKey: PlanKey;
  period: BillingPeriod;
  productId: string;
}

/**
 * Plan eşleştirmelerinden MAĞAZA ürünlerini süzer.
 *
 * NEDEN AYRI DOSYA: servisin kendisi NestJS dekoratörleri taşıyor ve bu
 * projenin test koşucusu (Node'un tip silme ile çalışan yerleşiği, bkz.
 * scripts/run-tests.mjs) dekoratörlü bir dosyayı içe aktaramıyor. Karar saf
 * olduğu için ayrı durabiliyor ve böylece test edilebiliyor.
 *
 * İki kural burada, tek yerde:
 *  1. iyzico bir mağaza değil — mobil istemciyi ilgilendirmiyor.
 *  2. Referans kodu tanımsız olan plan mağazada YOK demektir. İstemciye
 *     verilirse o kimliği mağazaya sorar, "ürün bulunamadı" alır ve kullanıcı
 *     bunu "abonelik bozuk" diye görür.
 */
export function magazaUrunleri(refs: PlanRef[]): MagazaUrunu[] {
  return refs
    .filter((r) => r.provider !== "iyzico" && Boolean(r.referenceCode))
    .map((r) => ({
      provider: r.provider,
      planKey: r.planKey,
      period: r.period,
      productId: r.referenceCode as string,
    }));
}
