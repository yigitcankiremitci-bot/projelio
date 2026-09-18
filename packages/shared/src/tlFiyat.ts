/**
 * Paketin TL tahsilat tutarı: USD fiyat × kur, 10 ₺'nin katına YUKARI yuvarlanır.
 *
 * Sunucu (kur kaydedilince tutarları yazar) ve admin ekranı (önizleme) AYNI
 * fonksiyondan geçer; iki ayrı hesap bir gün ayrışır ve panelde görünen tutarla
 * yazılan tutar farklı olurdu.
 *
 * NEDEN YUKARI: kur yükselirken aşağı yuvarlamak her dönem biraz zarar etmek
 * demek; 10 ₺ adım da vitrinde "246,33 ₺" yerine düz bir tutar gösterir.
 *
 * KAYAN NOKTA: 9,99 × 50 = 499,49999… ve 10 × 50 = 500,0000001 gibi artıklar
 * yukarı yuvarlamada bir basamak fazladan atlatır (500 → 510). Önce kuruşa
 * yuvarlanıp sonra 10'a çıkarılıyor.
 */
export const TL_FIYAT_ADIMI = 10;

export function tlFiyat(usd: number, kur: number): number | null {
  if (!Number.isFinite(usd) || !Number.isFinite(kur) || usd <= 0 || kur <= 0) return null;
  const kurus = Math.round(usd * kur * 100);
  return Math.ceil(kurus / (TL_FIYAT_ADIMI * 100)) * TL_FIYAT_ADIMI;
}
