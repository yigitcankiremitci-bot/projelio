/**
 * Müşteriye özel iskontolu fiyat ve KDV — saf hesap (migration 188).
 *
 * Kural (kullanıcı kararı, 2026-11-09):
 *   · Katalog fiyatı KDV HARİÇ girilir (products.price), KDV `tax_rate` ile eklenir.
 *   · Liste fiyatı herkese aynı; iskonto müşteriye göre (party.iskonto_orani, %).
 *   · Sıra: önce iskonto (KDV hariç fiyata), sonra KDV. Her adım kuruşa
 *     yuvarlanır (yarım yukarı) — faturadaki birim fiyat da böyle hesaplanır.
 *   · Sipariş kalemlerine KDV DAHİL tutar yazılır (168'den beri: tahsilat
 *     gerçekte gelen parayla eşleşsin).
 *
 * NEDEN TAM SAYI KURUŞ: kayan noktada 0,5 × 2,01 = 1,0049999… olur ve
 * "kuruşa yuvarla" 1,00 verir; doğrusu 1,01. Ticari veride bir kuruşluk fark
 * bile fatura ile tahsilatın ayrışması demek. Hesap baştan sona tam sayı
 * kuruş ve "baz puan" (yüzde × 100) üzerinden yapılır.
 *
 * Örnek: liste 100,00 TL, %12,5 iskonto, %10 KDV
 *   → iskontolu KDV hariç 87,50 → KDV dahil 96,25.
 */

/** 2 haneli ondalık sayıyı tam sayı kuruşa çevirir (149,9 → 14990). */
export function kurusa(x: number): number {
  return Math.round(Number(x) * 100);
}

/** Yüzdeyi baz puana çevirir (12,5 → 1250). */
function bazPuan(yuzde: number | null | undefined): number {
  return Math.round((Number(yuzde) || 0) * 100);
}

/** pay / payda, yarım yukarı yuvarlı (pay ≥ 0, payda > 0, ikisi de tam sayı). */
function yarimYukari(pay: number, payda: number): number {
  return Math.floor((2 * pay + payda) / (2 * payda));
}

export interface IskontoluFiyat {
  /** Liste fiyatı, KDV hariç (katalogdaki). */
  listeNet: number;
  /** Liste fiyatı, KDV dahil. */
  listeKdvDahil: number;
  /** İskontolu fiyat, KDV hariç. */
  net: number;
  /** İskontolu fiyat, KDV dahil — siparişin birim fiyatı bu. */
  kdvDahil: number;
}

/**
 * Birim fiyatı hesaplar. Fiyat yoksa ya da sıfırsa null (satılamaz).
 * İskonto 0-100, KDV 0-100 dışındaysa sınıra çekilir; doğrulama yazımda yapılıyor.
 */
export function iskontoluFiyat(
  listeFiyati: number | null | undefined,
  iskontoOrani: number | null | undefined,
  kdvOrani: number | null | undefined
): IskontoluFiyat | null {
  if (listeFiyati === null || listeFiyati === undefined || !(Number(listeFiyati) > 0)) return null;
  const liste = kurusa(listeFiyati);
  const iskonto = Math.min(10000, Math.max(0, bazPuan(iskontoOrani)));
  const kdv = Math.min(10000, Math.max(0, bazPuan(kdvOrani)));
  const net = yarimYukari(liste * (10000 - iskonto), 10000);
  return {
    listeNet: liste / 100,
    listeKdvDahil: yarimYukari(liste * (10000 + kdv), 10000) / 100,
    net: net / 100,
    kdvDahil: yarimYukari(net * (10000 + kdv), 10000) / 100,
  };
}

/**
 * Kalem tutarı: birim fiyat × adet, tam sayı kuruşla. Adet en çok 2 ondalık
 * (kg, metre); 2,5 × 96,25 = 240,625 → 240,63.
 */
export function kalemTutariKurus(birimFiyat: number, miktar: number): number {
  const birim = kurusa(birimFiyat);
  const adet = Math.round(Number(miktar) * 100);
  return yarimYukari(birim * adet, 100) / 100;
}

/** Kalem tutarlarının toplamı, kuruş kaybı olmadan. */
export function tutarToplami(tutarlar: number[]): number {
  return tutarlar.reduce((t, x) => t + kurusa(x), 0) / 100;
}
