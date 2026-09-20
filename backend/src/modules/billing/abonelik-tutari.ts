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
 * ÖNCELİK: sağlayıcıda SABİTLENMİŞ tutar > kurdan hesaplanan tutar. Sabitlenmiş
 * saymak için referans KODU da gerekir: iyzico gibi sağlayıcılarda tutar ancak
 * bir ödeme planına bağlıysa sabittir ve karttan çekilecek olan odur.
 * Kodsuz satırlar yalnızca panelin yazdığı bir ÖNBELLEKTİR; onları öncelikli
 * saymak, fiyat değişince ekranda eski tutarı bırakıyordu (2026-09-20'de
 * yıllık fiyatlar değişince yaşandı: katalog 2.520 derken vitrin 2.440 dedi).
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

  if (ref?.referenceCode && ref.priceAmount !== null && ref.priceAmount !== undefined) {
    return { amount: ref.priceAmount, currency: ref.currency || "TRY" };
  }

  if (kur === null) return null;

  // YILLIK TOPLAM = AYLIK KARŞILIĞIN 12 KATI, kurdan ayrıca hesaplanmaz.
  // İkisi ayrı ayrı 10 ₺'ye yuvarlanınca birbirini tutmuyordu: vitrin
  // "200 ₺/ay" derken toplam 2.440 ₺ görünüyordu (2.440 / 12 = 203,33).
  if (period === "yearly") {
    const aylikKarsilik = aylikKarsilikTl(plan, kur);
    return aylikKarsilik === null ? null : { amount: aylikKarsilik * 12, currency: "TRY" };
  }

  const tutar = tlFiyat(plan.priceUsdMonthly, kur);
  return tutar === null ? null : { amount: tutar, currency: "TRY" };
}

/**
 * Yıllık ödemede vitrinde gösterilen AYLIK KARŞILIĞIN TL tutarı.
 *
 * Yıllık toplamı 12'ye bölerek hesaplanmıyor: bölme küsuratlı bir rakam
 * üretir (2.500 / 12 = 208,33) ve vitrinde amatör durur. Katalogdaki aylık
 * karşılık (aylık × 10/12) kurla çarpılıp aynı 10 ₺ adımına yuvarlanır, yani
 * aylık fiyatla aynı kuraldan geçer. YILLIK TOPLAM DA BUNUN 12 KATIDIR
 * (bkz. abonelikTutari), böylece vitrindeki iki rakam birbirini tutar.
 * Sonuç ~10 aylık ücret: 250 ₺/ay -> 210 ₺/ay, yıllık 2.520 ₺ (~%16 indirim).
 */
export function aylikKarsilikTl(plan: Plan, kur: number | null): number | null {
  if (plan.key === "free" || kur === null) return null;
  return tlFiyat(plan.priceUsdYearlyMonthly, kur);
}
