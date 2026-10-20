import type { SiparisKalemi } from "./types";

/**
 * Sipariş kalemleri — saf hesaplar (migration 168).
 *
 * Sunucu (siparişin tutarını kalemlerden yazarken, içe aktarmada) ve arayüz
 * (formdaki toplam, kartta "katalogdan %12 indirimli") aynı koddan geçer.
 *
 * Kuruş hassasiyeti: her kalem kuruşa yuvarlanır ve yuvarlama artığı en
 * büyük paylı kaleme yazılır — kalemlerin toplamı siparişin tutarına her
 * zaman tam eşit olsun. Aksi hâlde 3 × 333,33 = 999,99 olur, sipariş 1.000 TL kalırdı ve
 * ürün kartındaki ciro ile tahsilat raporu bir kuruş ayrışırdı.
 */

function kurus(x: number): number {
  return Math.round(x * 100) / 100;
}

export function kalemToplami(kalemler: Pick<SiparisKalemi, "tutar">[]): number {
  return kurus(kalemler.reduce((t, k) => t + Number(k.tutar || 0), 0));
}

/** Miktar × birim fiyat, kuruşa yuvarlı. */
export function kalemTutari(k: Pick<SiparisKalemi, "miktar" | "birimFiyat">): number {
  return kurus(Number(k.miktar || 0) * Number(k.birimFiyat || 0));
}

/**
 * Siparişin toplamını kalemlere dağıtır (tutar esas).
 *
 * Ağırlık: kalemin katalog tutarı (listeBirimFiyat × miktar); katalog fiyatı
 * BİLİNMEYEN kalem varsa ağırlık miktara düşer — fiyatsız bir kalemin payını
 * sıfır saymak onu bedava gösterirdi. Fiyatı 0 olan kalem ise gerçekten
 * bedavadır, pay almaz. Birim fiyat = dağıtılan tutar / miktar
 * (4 haneye yuvarlı: 3 adete bölünen 1.000 TL 333,3333 olur, tutar yine 1.000).
 */
export function kalemleriOrantila<T extends Pick<SiparisKalemi, "miktar" | "listeBirimFiyat">>(
  kalemler: T[],
  toplam: number
): (T & { birimFiyat: number; tutar: number })[] {
  if (kalemler.length === 0) return [];
  // Sıfır fiyat GEÇERLİ bir fiyattır (hediye kalemi pay almaz); fiyatın
  // hiç bilinmemesi (boş) değildir.
  const fiyatlar = kalemler.map((k) =>
    k.listeBirimFiyat === undefined || k.listeBirimFiyat === null ? NaN : Number(k.listeBirimFiyat)
  );
  const fiyatAgirligi = kalemler.map((k, i) => fiyatlar[i] * Number(k.miktar));
  const fiyatToplami = fiyatAgirligi.reduce((t, a) => t + a, 0);
  const fiyatla = fiyatlar.every((f) => Number.isFinite(f) && f >= 0) && fiyatToplami > 0;
  const agirlik = fiyatla ? fiyatAgirligi : kalemler.map((k) => Number(k.miktar));
  const toplamAgirlik = agirlik.reduce((t, a) => t + a, 0);
  const hedef = kurus(toplam);

  const tutarlar = agirlik.map((a) =>
    kurus(toplamAgirlik > 0 ? (hedef * a) / toplamAgirlik : hedef / kalemler.length)
  );
  // Yuvarlama artığı en büyük paylı kaleme: son kaleme yazılsaydı son kalem
  // bedava bir hediye olduğunda ona 0,01 TL düşerdi.
  const artik = kurus(hedef - tutarlar.reduce((t, x) => t + x, 0));
  if (artik !== 0) {
    let enBuyuk = 0;
    for (let i = 1; i < agirlik.length; i++) if (agirlik[i] > agirlik[enBuyuk]) enBuyuk = i;
    tutarlar[enBuyuk] = kurus(tutarlar[enBuyuk] + artik);
  }

  return kalemler.map((k, i) => {
    const miktar = Number(k.miktar) || 1;
    return { ...k, tutar: tutarlar[i], birimFiyat: Math.round((tutarlar[i] / miktar) * 10000) / 10000 };
  });
}

/**
 * Siparişin katalog fiyatından sapması: 0,12 = %12 pahalı, -0,30 = %30
 * indirimli. Katalog fiyatı eksik bir kalem varsa hesaplanmaz (undefined):
 * kısmi bir karşılaştırma yanlış bir oran gösterirdi.
 */
export function katalogSapmasi(kalemler: Pick<SiparisKalemi, "miktar" | "listeBirimFiyat" | "tutar">[]): number | undefined {
  if (kalemler.length === 0 || kalemler.some((k) => !(Number(k.listeBirimFiyat) > 0))) return undefined;
  const liste = kalemler.reduce((t, k) => t + Number(k.listeBirimFiyat) * Number(k.miktar), 0);
  if (liste <= 0) return undefined;
  return Math.round((kalemToplami(kalemler) / liste - 1) * 1000) / 1000;
}

/** Katalogdaki fiyat KDV hariç tutuluyor; satış KDV dahil. */
export function kdvDahilFiyat(fiyat: number | undefined | null, kdvOrani: number | undefined | null): number | undefined {
  if (fiyat === undefined || fiyat === null || !(Number(fiyat) > 0)) return undefined;
  return kurus(Number(fiyat) * (1 + (Number(kdvOrani) || 0) / 100));
}
