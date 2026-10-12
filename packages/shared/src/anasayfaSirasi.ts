// Şirket anasayfasındaki bölümlerin (Ürün/Hizmet, Departmanlar, Ekip, Modüller)
// kullanıcının dizdiği sırası. Sunucu kaydederken, arayüz gösterirken AYNI
// kuraldan geçer: biri bilinmeyen anahtarı atıp öbürü tutarsa sıra cihazdan
// cihaza farklı görünürdü.

export const ANASAYFA_BOLUMLERI = ["products", "departments", "team", "modules"] as const;
export type AnasayfaBolumu = (typeof ANASAYFA_BOLUMLERI)[number];

/**
 * Kayıtlı sırayı geçerli bölümlere uygular. Bilinmeyen ve tekrar eden anahtarlar
 * atlanır, kayıtta olmayan (sonradan eklenmiş) bölüm varsayılan yeriyle SONA
 * gelir — eski bir kayıt yeni bölümü kaybettirmesin.
 */
export function anasayfaSirasiniCoz(kayitli: unknown): AnasayfaBolumu[] {
  const sonuc: AnasayfaBolumu[] = [];
  if (Array.isArray(kayitli)) {
    for (const x of kayitli) {
      if ((ANASAYFA_BOLUMLERI as readonly unknown[]).includes(x) && !sonuc.includes(x as AnasayfaBolumu)) {
        sonuc.push(x as AnasayfaBolumu);
      }
    }
  }
  for (const b of ANASAYFA_BOLUMLERI) if (!sonuc.includes(b)) sonuc.push(b);
  return sonuc;
}

/** Bölümü bir yukarı (-1) ya da aşağı (+1) taşır; uçta ise sıra değişmez. */
export function bolumuTasi(sira: AnasayfaBolumu[], bolum: AnasayfaBolumu, yon: -1 | 1): AnasayfaBolumu[] {
  const i = sira.indexOf(bolum);
  const j = i + yon;
  if (i < 0 || j < 0 || j >= sira.length) return sira;
  const yeni = [...sira];
  [yeni[i], yeni[j]] = [yeni[j], yeni[i]];
  return yeni;
}
