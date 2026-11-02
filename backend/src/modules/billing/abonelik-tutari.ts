import { tlFiyat } from "@projelio/shared";
import { ekKoltukSayisi, ekKoltukYillikAylikUsd, type BillingPeriod, type Plan } from "./billing.plans";

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
  ref?: SaglayiciTutari | null,
  koltuk?: number | null
): { amount: number; currency: string } | null {
  const taban = tabanTutar(plan, period, kur, ref);
  const ek = ekKoltukSayisi(plan, koltuk);
  if (taban === null || ek === 0) return taban;

  // Ek kişiler TABANDAN AYRI fiyatlanıp toplanır: taban sağlayıcıda sabitlenmiş
  // olabilir, kişi başı tutar ise her zaman kurdan gelir. Kur yoksa ek kişili
  // paket satılmaz (taban satılabilse bile) — uydurma bir kişi başı tutar yok.
  const kisiBasi = ekKoltukTl(plan, period, kur);
  return kisiBasi === null ? null : { amount: taban.amount + ek * kisiBasi, currency: taban.currency };
}

/**
 * Bir ek kişinin dönem başına TL tutarı. Yıllıkta tabanla aynı kural: aylık
 * karşılık 10 ₺'ye yuvarlanır, yıllık = onun 12 katı (vitrindeki iki rakam tutsun).
 */
export function ekKoltukTl(plan: Plan, period: BillingPeriod, kur: number | null): number | null {
  if (!plan.ekKoltuk || kur === null) return null;
  if (period === "yearly") {
    const aylik = tlFiyat(ekKoltukYillikAylikUsd(plan.ekKoltuk), kur);
    return aylik === null ? null : aylik * 12;
  }
  return tlFiyat(plan.ekKoltuk.usdMonthly, kur);
}

/**
 * Vitrindeki ek kişi satırı. Panel ve tanıtım sitesinin ucu ikisi de bunu
 * döner; ayrı hesaplasalar ek kişi fiyatı iki yerde ayrışırdı. Tutar null ise
 * (kur yok) ek kişi satılamaz.
 */
export function ekKoltukVitrini(plan: Plan, kur: number | null) {
  if (!plan.ekKoltuk) return null;
  const yillikTl = ekKoltukTl(plan, "yearly", kur);
  return {
    priceUsd: { monthly: plan.ekKoltuk.usdMonthly, yearlyMonthly: ekKoltukYillikAylikUsd(plan.ekKoltuk) },
    charge: { monthly: ekKoltukTl(plan, "monthly", kur), yearlyMonthly: yillikTl === null ? null : yillikTl / 12 },
    credits: plan.ekKoltuk.credits,
    max: plan.ekKoltuk.enCok,
  };
}

function tabanTutar(
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
