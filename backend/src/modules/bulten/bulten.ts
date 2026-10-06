/**
 * Bülten aboneliğinin saf kuralları — servis ve testler aynı koddan geçer.
 */

export interface BultenGirdisi {
  eposta?: unknown;
  dil?: unknown;
  kaynak?: unknown;
  izin?: unknown;
  /** Bal küpü: insanlar görmez, botlar doldurur. */
  website?: unknown;
}

export type BultenKarari =
  | { tur: "kaydet"; eposta: string; dil: "tr" | "en"; kaynak: string | null }
  | { tur: "bot" }
  | { tur: "hata"; mesaj: string };

const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function bultenGirdisiniCoz(g: BultenGirdisi): BultenKarari {
  // Bot sessizce "başarılı" görür: hata dönmek ona neyi düzeltmesi gerektiğini söylerdi.
  if (typeof g.website === "string" && g.website.trim()) return { tur: "bot" };

  const eposta = typeof g.eposta === "string" ? g.eposta.trim().toLowerCase() : "";
  if (!eposta || eposta.length > 160 || !EPOSTA.test(eposta)) {
    return { tur: "hata", mesaj: "Geçerli bir e-posta adresi yazın." };
  }
  // Ticari ileti için açık rıza şart (6563). Kutu formda zorunlu ama formu
  // atlayıp doğrudan uca gelen istek de rızasız kayıt açamamalı.
  if (g.izin !== true) {
    return { tur: "hata", mesaj: "Bülten için onay kutusunu işaretleyin." };
  }
  const dil = g.dil === "en" ? "en" : "tr";
  const kaynak = typeof g.kaynak === "string" && g.kaynak.trim() ? g.kaynak.trim().slice(0, 200) : null;
  return { tur: "kaydet", eposta, dil, kaynak };
}
