import type { Product } from "@projelio/shared";
import { PRODUCT_UNIT_LABEL } from "@projelio/shared";
import { bicimDili } from "./i18n/depo";

// Ürün kartında gösterilen türev rakamlar. Hiçbiri veritabanında tutulmuyor:
// fiyat ya da maliyet değişince yeniden hesaplanması gereken bir kopya, bir gün
// eskisini göstermeye başlar.

/**
 * Brüt kâr marjı (yüzde): (fiyat − maliyet) / fiyat.
 *
 * KDV HARİÇ fiyat üzerinden: maliyet de KDV'siz girilir, KDV satıcının kârı
 * değil devlete aktarılan paradır. Fiyat yoksa ya da sıfırsa marj anlamsızdır
 * (sıfıra bölme), `null` döner — "%0" göstermek "kârsız satıyoruz" demek olurdu.
 */
export function brutKarMarji(price?: number, costPrice?: number): number | null {
  if (price === undefined || price === null || costPrice === undefined || costPrice === null) return null;
  if (!(price > 0)) return null;
  return ((price - costPrice) / price) * 100;
}

/** Birim başına brüt kâr. Maliyet ya da fiyat yoksa `null`. */
export function birimKar(price?: number, costPrice?: number): number | null {
  if (price === undefined || price === null || costPrice === undefined || costPrice === null) return null;
  return price - costPrice;
}

/** KDV dahil fiyat. Oran girilmemişse `null`: "KDV yok" ile "bilinmiyor" aynı şey değil. */
export function kdvDahilFiyat(price?: number, taxRate?: number): number | null {
  if (price === undefined || price === null || taxRate === undefined || taxRate === null) return null;
  // Kuruş hassasiyetinde yuvarlanıyor: 99,99 × 1,2 kayan noktada 119,98799…
  return Math.round(price * (1 + taxRate / 100) * 100) / 100;
}

export type StokDurumu = "yok" | "tukendi" | "kritik" | "yeterli";

/**
 * Stok durumu. Kritik seviye girilmemişse "kritik" hiç üretilmez — eşiği
 * uydurmak, hiç eşik belirlememiş kullanıcıyı gereksiz uyarılarla boğardı.
 * Eşik DAHİL: "5'in altına düşerse" diyen kullanıcı 5'te sipariş verir.
 */
export function stokDurumu(stockQuantity?: number, minStock?: number): StokDurumu {
  if (stockQuantity === undefined || stockQuantity === null) return "yok";
  if (stockQuantity <= 0) return "tukendi";
  if (minStock !== undefined && minStock !== null && stockQuantity <= minStock) return "kritik";
  return "yeterli";
}

export function formatPara(value: number | null | undefined, currency?: string): string | null {
  if (value === undefined || value === null) return null;
  try {
    return new Intl.NumberFormat(bicimDili(), { style: "currency", currency: currency || "TRY" }).format(value);
  } catch {
    return `${value} ${currency ?? ""}`.trim();
  }
}

export function formatMiktar(value: number | null | undefined, product: Pick<Product, "unit">): string | null {
  if (value === undefined || value === null) return null;
  const miktar = new Intl.NumberFormat(bicimDili(), { maximumFractionDigits: 2 }).format(value);
  return product.unit ? `${miktar} ${PRODUCT_UNIT_LABEL[product.unit].toLocaleLowerCase("tr-TR")}` : miktar;
}

export interface KartMaddesi {
  /** Sözlük anahtarı olarak da kullanılan etiket. */
  etiket: string;
  tamam: boolean;
}

/**
 * Ürün kartının doluluk listesi — "bu ürünü satmak için neyi eksik bıraktık".
 *
 * Hizmette stok ve teknik özellik aranmaz: bir danışmanlık hizmetinin stoğu
 * olmaz, onu "eksik" saymak kartı hiçbir zaman tamamlanamaz hâle getirirdi.
 * Strateji yalnızca modül şirkette açıksa sayılır — kullanıcının açamayacağı
 * bir modülü eksik göstermek çözümsüz bir uyarı olurdu.
 */
export function kartDolulugu(
  product: Pick<Product, "kind" | "description" | "images" | "coverImageUrl" | "price" | "costPrice" | "features" | "specs" | "stockQuantity">,
  strateji: { enabled: boolean; yazili: boolean }
): KartMaddesi[] {
  const hizmet = product.kind === "service";
  const fotografVar = (product.images?.length ?? 0) > 0;
  // Etiketler arayüzde t() ile çevrilir (bkz. ProductDetailModal).
  // dil:anahtar-baslangic
  const maddeler: Array<KartMaddesi | null> = [
    { etiket: "Açıklama", tamam: !!product.description?.trim() },
    { etiket: "Fotoğraf", tamam: fotografVar },
    { etiket: "Satış fiyatı", tamam: product.price !== undefined && product.price !== null },
    { etiket: "Maliyet", tamam: product.costPrice !== undefined && product.costPrice !== null },
    { etiket: "Öne çıkan özellikler", tamam: (product.features?.length ?? 0) > 0 },
    hizmet ? null : { etiket: "Teknik özellikler", tamam: (product.specs?.length ?? 0) > 0 },
    hizmet ? null : { etiket: "Stok miktarı", tamam: product.stockQuantity !== undefined && product.stockQuantity !== null },
    strateji.enabled ? { etiket: "Ürün stratejisi", tamam: strateji.yazili } : null,
  ];
  // dil:anahtar-bitis
  return maddeler.filter((m): m is KartMaddesi => m !== null);
}
