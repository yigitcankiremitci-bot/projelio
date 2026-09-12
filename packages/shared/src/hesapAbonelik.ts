import type { RecurrenceInterval } from "./types";

/**
 * Abonelik tutarlarının aylık karşılığı — saf hesap.
 *
 * NEDEN ORTAK DOSYADA: aynı hesabı üç yer yapıyor — Hesaplar ekranındaki özet,
 * Lio'nun "aylık yazılım gideri ne kadar" cevabı ve ileride finansal panel.
 * Üç kopya, biri düzeltilip diğerleri unutulduğunda üç farklı rakam demekti.
 * Bütçe toplamasında da aynı gerekçeyle ortak dosya var (butceToplama.ts).
 *
 * KUR DÖNÜŞÜMÜ YOK: toplamlar para birimi BAŞINA ayrı hesaplanır.
 * "1.000 USD + 1.000 TRY = 2.000 ₺" her zaman yanlıştır ve kur kaynağı olmadan
 * doğrusu üretilemez — defterin kuralı bu, burada da aynısı geçerli.
 */

/**
 * Haftalık tutarın aylık karşılığındaki bölen.
 *
 * 4 DEĞİL 4,345: bir ay ortalama 4,345 hafta (365/12/7). "4 hafta = 1 ay"
 * demek yıllık 12 değil 13 ödeme yapan bir kalemi yıllıkta %8 eksik gösterir.
 */
const HAFTA_AYDA = 365 / 12 / 7;

const AYLIK_BOLEN: Record<RecurrenceInterval, number> = {
  weekly: 1 / HAFTA_AYDA,
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

/** Bir aboneliğin aylık karşılığı. Ücretsiz/eksik kayıtlarda null. */
export function aylikKarsilikHesapla(
  amount: number | undefined | null,
  interval: RecurrenceInterval | undefined | null
): number | null {
  if (!amount || !interval) return null;
  const bolen = AYLIK_BOLEN[interval];
  if (!bolen) return null;
  return amount / bolen;
}

export interface AbonelikKalemi {
  isPaid: boolean;
  amount?: number;
  currency: string;
  billingInterval?: RecurrenceInterval;
}

/** Para birimi başına aylık toplam; büyükten küçüğe sıralı. */
export function aylikToplamlar(kalemler: AbonelikKalemi[]): { currency: string; amount: number }[] {
  const kova = new Map<string, number>();
  for (const kalem of kalemler) {
    if (!kalem.isPaid) continue;
    const aylik = aylikKarsilikHesapla(kalem.amount, kalem.billingInterval);
    if (aylik === null) continue;
    kova.set(kalem.currency, (kova.get(kalem.currency) ?? 0) + aylik);
  }
  return Array.from(kova.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);
}
