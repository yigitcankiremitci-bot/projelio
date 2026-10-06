import { medyan } from "./icerikAnalizi";
import type { SocialCompetitorPost } from "./types";

/**
 * Rakip istatistiklerinin saf hesapları.
 *
 * Rakipte izlenme YOK (Business Discovery yalnızca beğeni/yorum veriyor); kıyas
 * değeri etkileşim = beğeni + yorum. Kendi gönderilerimizdeki gibi her gönderi
 * o hesabın KENDİ normaliyle (medyan) kıyaslanır — büyük bir hesabın 5 bin
 * beğenisi ile küçük bir hesabın 500'ü ancak böyle yan yana konur.
 */

/** Kıyasa girmeyen taze gönderi süresi (etkileşim ilk günlerde hızla artıyor). */
export const RAKIP_OLGUNLASMA_SAATI = 48;

export function etkilesim(p: Pick<SocialCompetitorPost, "likeCount" | "commentsCount">): number | null {
  if (typeof p.likeCount !== "number" && typeof p.commentsCount !== "number") return null;
  return (p.likeCount ?? 0) + (p.commentsCount ?? 0);
}

export interface RakipOzeti {
  /** Son 28 günde haftalık ortalama gönderi. */
  haftalikGonderi: number;
  medyanEtkilesim: number | null;
  /** Takipçi başına medyan etkileşim (%) — takipçi bilinmiyorsa null. */
  etkilesimOrani: number | null;
  takipciDegisim7: number | null;
  takipciDegisim30: number | null;
}

export function rakipOzeti(
  gonderiler: SocialCompetitorPost[],
  takipciGecmisi: { gun: string; deger: number }[],
  takipci: number | undefined,
  simdi: Date
): RakipOzeti {
  const sinir28 = simdi.getTime() - 28 * 86_400_000;
  const son28 = gonderiler.filter((g) => g.postedAt && Date.parse(g.postedAt) >= sinir28).length;
  const olgunlar = gonderiler
    .filter((g) => !g.postedAt || simdi.getTime() - Date.parse(g.postedAt) >= RAKIP_OLGUNLASMA_SAATI * 3_600_000)
    .map(etkilesim)
    .filter((e): e is number => e !== null);
  const md = medyan(olgunlar);

  const degisim = (gun: number): number | null => {
    if (takipciGecmisi.length < 2) return null;
    const son = takipciGecmisi[takipciGecmisi.length - 1];
    const hedef = new Date(Date.parse(`${son.gun}T00:00:00Z`) - gun * 86_400_000).toISOString().slice(0, 10);
    // Hedef güne en yakın ÖNCEKİ (ya da ilk) kayıt; geçmiş kısaysa elde olanla.
    const taban = [...takipciGecmisi].reverse().find((n) => n.gun <= hedef) ?? takipciGecmisi[0];
    return taban.gun === son.gun ? null : son.deger - taban.deger;
  };

  return {
    haftalikGonderi: Math.round((son28 / 4) * 10) / 10,
    medyanEtkilesim: md,
    etkilesimOrani: md !== null && takipci ? Math.round((md / takipci) * 10_000) / 100 : null,
    takipciDegisim7: degisim(7),
    takipciDegisim30: degisim(30),
  };
}

/** Her gönderinin o hesabın medyan etkileşimine oranı (taze ve verisiz olanlar null). */
export function rakipKatlari(gonderiler: SocialCompetitorPost[], simdi: Date): Map<string, number | null> {
  const olgunMu = (g: SocialCompetitorPost) =>
    !g.postedAt || simdi.getTime() - Date.parse(g.postedAt) >= RAKIP_OLGUNLASMA_SAATI * 3_600_000;
  const md = medyan(gonderiler.filter(olgunMu).map(etkilesim).filter((e): e is number => e !== null));
  const sonuc = new Map<string, number | null>();
  for (const g of gonderiler) {
    const e = etkilesim(g);
    sonuc.set(g.externalMediaId, e !== null && md && olgunMu(g) ? Math.round((e / md) * 10) / 10 : null);
  }
  return sonuc;
}
