import { tlFiyat } from "@projelio/shared";
import type { BillingPeriod, Plan } from "./billing.plans";

/**
 * Bir paketin dönem başına TAHSİLAT TUTARI (saf fonksiyon).
 *
 * NEDEN AYRI BİR DOSYA: aynı hesabı hem abonelik ekranı (billing.service) hem
 * tanıtım sitesinin okuduğu herkese açık uç (billing-public.controller)
 * yapıyor. İki kopya bir gün ayrışır ve site ile panel farklı fiyat gösterirdi.
 *
 * TAHSİLAT HER ZAMAN TL. Katalogdaki USD fiyat bir iç referanstır, müşteriye
 * gösterilen ve karttan çekilen tutar TL'dir (bkz. paytr.client.ts, para birimi
 * "TL" olarak sabit). Türkiye'de yerleşik müşterilere dövizle fiyatlama
 * mevzuatça sınırlı olduğu için vitrin de TL gösterir; dolar yalnızca İngilizce
 * sürümde bilgilendirme amacıyla görünür.
 *
 * ÖNCELİK: sağlayıcıda sabitlenmiş tutar > kurdan hesaplanan tutar.
 * Sebebi, bir sağlayıcı planında (iyzico'nun ödeme planı gibi) tutar SABİTSE
 * karttan çekilecek olan odur; hesaplanmış bir rakam göstermek kullanıcıya bir
 * tutar deyip başkasını çekmek olurdu.
 *
 * KUR YOKSA null. Uydurma bir kurla satış yapmaktansa düğmeyi kapatmak doğru
 * (Lio Bakiyesi paketlerinde verilen kararın aynısı).
 */
export interface SaglayiciTutari {
  referenceCode: string | null;
  priceAmount: number | null;
  currency: string;
}

export function abonelikTutari(
  plan: Plan,
  period: BillingPeriod,
  kur: number | null,
  ref?: SaglayiciTutari | null
): { amount: number; currency: string } | null {
  // Ücretsiz plan satın alınmaz; 0 ₺ göstermek "satın al" düğmesini anlamsızca açardı.
  if (plan.key === "free") return null;

  if (ref?.priceAmount !== null && ref?.priceAmount !== undefined) {
    return { amount: ref.priceAmount, currency: ref.currency || "TRY" };
  }

  if (kur === null) return null;
  const usd = period === "yearly" ? plan.priceUsdYearly : plan.priceUsdMonthly;
  const tutar = tlFiyat(usd, kur);
  return tutar === null ? null : { amount: tutar, currency: "TRY" };
}

/**
 * Yıllık ödemede vitrinde gösterilen AYLIK KARŞILIĞIN TL tutarı.
 *
 * Yıllık toplamı 12'ye bölerek hesaplanmıyor: bölme küsuratlı bir rakam
 * üretebilir (2.390 / 12 = 199,17) ve vitrinde amatör durur. Katalogdaki
 * aylık karşılık (x,99) doğrudan kurla çarpılıp aynı 10 ₺ adımına yuvarlanır,
 * yani aylık fiyatla aynı kuraldan geçer.
 */
export function aylikKarsilikTl(plan: Plan, kur: number | null): number | null {
  if (plan.key === "free" || kur === null) return null;
  return tlFiyat(plan.priceUsdYearlyMonthly, kur);
}
