import type { MusteriSiparisi, SiparisAsamasi, SiparisKalemi } from "./types";

/**
 * Siparişin AŞAMASI ve stok kuralı — saf karar (migration 187).
 *
 * "Durum" değil "aşama": kodda sipariş durumu zaten TAHSİLAT durumu
 * (bekliyor / kısmi / tahsil edildi / gecikti, tahsilat.ts). İkisi bağımsız.
 *
 * Stok kuralı (kullanıcı kararı, 2026-11-09):
 *   · Sipariş onaylı bir aşamaya İLK geçişte (alındı → onaylandı/hazırlanıyor/
 *     yolda/teslim) stok BİR KEZ düşer.
 *   · Onaydan sonra iptal edilirse geri eklenir; onay öncesi iptal stoğa dokunmaz.
 *   · Onaydan sonraki aşamalar arasında geri adım serbest; "alındı"ya dönüş
 *     YOK (stok düştü, geri almak iptal demek). İptal geri alınamaz.
 *   · Elle açılan ve web sitesinden gelen siparişlerde çalışır. Shopify kendi
 *     stoğunu yönetiyor, Excel geçmiş kargo listesi — onlarda aşama değişir,
 *     stok değişmez.
 */

export const SIPARIS_ASAMALARI: SiparisAsamasi[] = ["alindi", "onaylandi", "hazirlaniyor", "yolda", "teslim_edildi", "iptal"];

/** Stoğun düşmüş olduğu (onaydan geçmiş) aşamalar. */
export const ONAYLI_ASAMALAR: SiparisAsamasi[] = ["onaylandi", "hazirlaniyor", "yolda", "teslim_edildi"];

// dil:anahtar-baslangic — etiketler arayüzde t() ile çevriliyor
export const SIPARIS_ASAMASI_ETIKET: Record<SiparisAsamasi, string> = {
  alindi: "Alındı",
  onaylandi: "Onaylandı",
  hazirlaniyor: "Hazırlanıyor",
  yolda: "Yolda",
  teslim_edildi: "Teslim edildi",
  iptal: "İptal",
};
// dil:anahtar-bitis

/** Dış API'deki (İngilizce) adı — portalın geliştiricisi bunu görür. */
export const SIPARIS_ASAMASI_API: Record<SiparisAsamasi, string> = {
  alindi: "received",
  onaylandi: "approved",
  hazirlaniyor: "preparing",
  yolda: "shipped",
  teslim_edildi: "delivered",
  iptal: "cancelled",
};

export function asamaMi(x: unknown): x is SiparisAsamasi {
  return typeof x === "string" && (SIPARIS_ASAMALARI as string[]).includes(x);
}

export function onayliMi(a: SiparisAsamasi | undefined): boolean {
  return !!a && ONAYLI_ASAMALAR.includes(a);
}

/** Bu kaynaktan gelen siparişte stok kuralı çalışır mı. */
export function stokTakipli(kaynak: MusteriSiparisi["kaynak"] | undefined): boolean {
  return kaynak === undefined || kaynak === "elle" || kaynak === "web_sitesi";
}

export type AsamaGecisi = { hata: string } | { stok: "satis" | "iade" | null };

/**
 * Aşama geçişi geçerli mi ve stok ne olur. Hata metni istisna olarak çevrilir.
 */
// dil:anahtar-baslangic — dönen metin sunucuda istisna, ekranda t() ile gösteriliyor
export function asamaGecisi(
  kaynak: MusteriSiparisi["kaynak"] | undefined,
  eski: SiparisAsamasi,
  yeni: SiparisAsamasi
): AsamaGecisi {
  if (eski === yeni) return { hata: "Sipariş zaten bu aşamada" };
  if (eski === "iptal") return { hata: "İptal edilen sipariş yeniden açılamaz" };
  if (yeni === "alindi") return { hata: "Onaylanan sipariş Alındı'ya geri alınamaz; gerekiyorsa iptal edin" };
  const takip = stokTakipli(kaynak);
  if (yeni === "iptal") return { stok: takip && onayliMi(eski) ? "iade" : null };
  // Buradan sonra yeni aşama onaylı; eski ya "alındı" ya başka bir onaylı aşama.
  return { stok: takip && eski === "alindi" ? "satis" : null };
}
// dil:anahtar-bitis

/**
 * Siparişin ürünleri ve adetleri değiştirilebilir mi. Stok düştükten sonra
 * değişirse düşen miktarla siparişteki miktar ayrışırdı; iptal edilmiş
 * siparişin kalemi de değişmez. Fiyat/tutar değişikliği serbest (stoğa etkisi yok).
 */
export function kalemlerKilitli(s: Pick<MusteriSiparisi, "asama" | "kaynak">): boolean {
  if (s.asama === "iptal") return true;
  return stokTakipli(s.kaynak) && onayliMi(s.asama);
}

/**
 * Kalemlerin stok "imzası": ürün → toplam adet (ürünsüz kalemler stoğu
 * etkilemez). Kilitli siparişte bu imza değişiyorsa düzenleme reddedilir.
 */
export function stokImzasi(kalemler: Pick<SiparisKalemi, "productId" | "miktar">[]): string {
  const m = new Map<string, number>();
  for (const k of kalemler) {
    if (!k.productId) continue;
    m.set(k.productId, Math.round(((m.get(k.productId) ?? 0) + Number(k.miktar || 0)) * 100) / 100);
  }
  return Array.from(m.entries())
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}
