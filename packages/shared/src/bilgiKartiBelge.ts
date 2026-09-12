/**
 * Belgenin geçerlilik durumu — sunucu ve arayüz AYNI koddan geçsin diye
 * paylaşılan pakette (bkz. butceToplama.ts, aynı gerekçe).
 *
 * Eşik 30 gün: vergi levhası ve faaliyet belgesi yenilemesi muhasebeciyle
 * konuşmayı gerektiriyor, "son gün" uyarısı geç kalmış oluyordu.
 */
export const BELGE_UYARI_GUNU = 30;

export type BelgeDurumu = "gecerli" | "yaklasiyor" | "doldu";

export function belgeDurumu(validUntil: string | undefined, bugun: Date = new Date()): BelgeDurumu {
  if (!validUntil) return "gecerli";
  const son = new Date(validUntil);
  if (Number.isNaN(son.getTime())) return "gecerli";
  // Gün bazında karşılaştırılır: saat farkı yüzünden "bugün dolan" belge
  // sabah geçerli, akşam dolmuş görünüyordu.
  const gunFarki = Math.floor((son.getTime() - bugun.getTime()) / 86400000);
  if (gunFarki < 0) return "doldu";
  if (gunFarki <= BELGE_UYARI_GUNU) return "yaklasiyor";
  return "gecerli";
}

export const BELGE_DURUM_ETIKET: Record<BelgeDurumu, string> = {
  gecerli: "Geçerli",
  yaklasiyor: "Süresi yaklaşıyor",
  doldu: "Süresi doldu",
};
