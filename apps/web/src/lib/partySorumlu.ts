import type { Party } from "@projelio/shared";

/**
 * Kartın SORUMLUSU (müşteriyle ilgilenen satışçı) — ekleyen kişi değil.
 *
 * Excel'den toplu aktarımda sistemdeki sorumlu alanı (owner_user_id) aktaranın
 * kendisi olur; şirketin kendi listesindeki sorumlu ("Sorumlu: MUSTAFA TÜRK")
 * not alanına yazılmış durumda. Sonuç: 318 kartın hepsinde aktaranın adı
 * görünüyordu (kullanıcı şikâyeti, 2026-11-11). Üstelik o satışçıların bir
 * kısmının Projelio hesabı yok, yani karta atanamıyorlar.
 *
 * Kural: kart sistemde ekleyenden BAŞKA birine atandıysa o atama geçerlidir
 * (bilinçli bir karar). Atanmadıysa (sorumlu = ekleyen) notta "Sorumlu:" varsa
 * o ad gösterilir; yoksa sistemdeki sorumlu.
 */
export function sorumluAdi(p: Pick<Party, "ownerUserId" | "ownerName" | "createdBy" | "notes">): string | undefined {
  const bilincliAtama = !!p.ownerUserId && !!p.createdBy && p.ownerUserId !== p.createdBy;
  const ad = bilincliAtama ? p.ownerName : notSorumlusu(p.notes) ?? p.ownerName;
  return ad ? okunurAd(ad) : undefined;
}

/**
 * Tamamı büyük harf olan kelimeleri okunur yapar ("Mehmet KİREMİTCİ" →
 * "Mehmet Kiremitci"). Sistemdeki ad ile nottaki ad farklı yazıldığında
 * Sorumlu filtresinde aynı kişi iki satır görünüyordu.
 */
function okunurAd(ad: string): string {
  return ad
    .split(/(\s+)/)
    .map((w) => (w.length > 1 && w === w.toLocaleUpperCase("tr") && w !== w.toLocaleLowerCase("tr") ? basHarfBuyuk(w) : w))
    .join("");
}

/**
 * Nottaki "Sorumlu: AD" parçası. Aktarılan notlar "Firma kodu: X · Sınıf: Y ·
 * Sorumlu: Z · Kayıt tarihi: …" biçiminde; ad bir sonraki ayraca kadar sürer.
 * Büyük harfle yazılmış ad okunur hâle getirilir ("MEHMET KİREMİTCİ" →
 * "Mehmet Kiremitci"): aynı kişi sistemdeki adıyla yan yana durabilsin.
 */
export function notSorumlusu(not?: string): string | undefined {
  if (!not) return undefined;
  const m = not.match(/(?:^|[·|;\n])\s*Sorumlu\s*:\s*([^·|;\n]+)/i);
  const ad = m?.[1].trim();
  if (!ad) return undefined;
  return ad === ad.toLocaleUpperCase("tr") ? basHarfBuyuk(ad) : ad;
}

function basHarfBuyuk(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .split(/(\s+)/)
    .map((w) => (w.trim() ? w.charAt(0).toLocaleUpperCase("tr") + w.slice(1) : w))
    .join("");
}
