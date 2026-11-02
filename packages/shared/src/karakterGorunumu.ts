// 3D ofiste kişinin karakteri: model ve renkler (migration 182, tablo
// ofis_karakterleri). Herkes yalnızca KENDİ karakterini değiştirir; başkalarının
// görünümü herkese açık (ofiste zaten görünüyor).
//
// Seçenekler sabit listelerden: istemciden gelen serbest renk kaydedilmez —
// hem tutarlı bir palet kalsın hem de alana rastgele metin yazılamasın.
// Kaydı olmayan kişinin karakteri eskisi gibi adından türetilir (web varliklar.ts).

/** Karakter modelleri: `dosya` public/ofis/modeller/karakterler/<dosya>.glb. Sıra adın türetilmesinde kullanılır, DEĞİŞTİRME. */
export const KARAKTER_MODELLERI = [
  { dosya: "erkek_suit", ad: "Takım elbise" },
  { dosya: "kadin_casual", ad: "Gündelik" },
  { dosya: "erkek_casual2", ad: "Gömlekli" },
  { dosya: "kadin_formal", ad: "Şık" },
  { dosya: "erkek_hoodie", ad: "Kapüşonlu" },
  { dosya: "kadin_suit", ad: "Ceketli" },
  { dosya: "erkek_worker", ad: "Saha (bıyıklı)" },
  { dosya: "kadin_worker", ad: "Saha" },
] as const;

export type KarakterModeli = (typeof KARAKTER_MODELLERI)[number]["dosya"];

// Karakter boyaları ürünün arayüz paleti değil (theme.ts): insan teni, saç ve
// kumaş renkleri. Bu yüzden burada, seçeneklerin yanında duruyorlar.
export const TEN_RENKLERI = ["#F3D5BC", "#E3B58F", "#C99068", "#9C6842", "#6E452A"] as const;
export const SAC_RENKLERI = ["#1F1A17", "#4A2E1E", "#7B4B2A", "#B98B4C", "#DCC38E", "#8E8E8E", "#A8452F"] as const;
export const KIYAFET_RENKLERI = ["#3E4858", "#1C222C", "#C0813F", "#2F6B5A", "#3C6D88", "#6F5D93", "#B0473A", "#E6E1D8"] as const;

/**
 * Kıyafet parçaları. Her modelin üstü, altı ve ayakkabısı ayrı parça ve bütün
 * modeller aynı iskeleti taşıyor: parçanın ŞEKLİ başka bir modelden alınabilir
 * (ör. takım elbiseli karaktere kapüşonlunun üstü). Boşsa modelin kendi parçası.
 */
export const KIYAFET_PARCALARI = [
  { alan: "ust", renk: "kiyafet", ad: "Üst" },
  { alan: "alt", renk: "altRenk", ad: "Alt" },
  { alan: "ayakkabi", renk: "ayakkabiRenk", ad: "Ayakkabı" },
] as const;

export type KiyafetParcasi = (typeof KIYAFET_PARCALARI)[number]["alan"];

export interface KarakterGorunumu {
  model: KarakterModeli;
  /** Boşsa modelin kendi rengi. */
  ten?: string;
  sac?: string;
  /** Üstün rengi (ad, parçalar ayrılmadan önceki tek kıyafet renginden kaldı). */
  kiyafet?: string;
  altRenk?: string;
  ayakkabiRenk?: string;
  /** Parçanın şeklinin alındığı model; boşsa karakterin kendi modeli. */
  ust?: KarakterModeli;
  alt?: KarakterModeli;
  ayakkabi?: KarakterModeli;
}

const renk = (liste: readonly string[], v: unknown): string | undefined =>
  typeof v === "string" ? liste.find((r) => r.toLowerCase() === v.toLowerCase()) : undefined;

/** Gelen veriyi doğrular; model geçersizse null, listede olmayan renk düşer. */
export function karakterGorunumuTemizle(ham: unknown): KarakterGorunumu | null {
  if (!ham || typeof ham !== "object") return null;
  const h = ham as Record<string, unknown>;
  const model = KARAKTER_MODELLERI.find((m) => m.dosya === h.model)?.dosya;
  if (!model) return null;
  const g: KarakterGorunumu = { model };
  const ten = renk(TEN_RENKLERI, h.ten);
  const sac = renk(SAC_RENKLERI, h.sac);
  if (ten) g.ten = ten;
  if (sac) g.sac = sac;
  for (const p of KIYAFET_PARCALARI) {
    const r = renk(KIYAFET_RENKLERI, h[p.renk]);
    if (r) g[p.renk] = r;
    // Kendi modelinin parçası seçildiyse yazılmaz: kayıt "boş = kendi parçası" ile tek biçimde kalsın.
    const sekil = KARAKTER_MODELLERI.find((m) => m.dosya === h[p.alan])?.dosya;
    if (sekil && sekil !== model) g[p.alan] = sekil;
  }
  return g;
}

/** Bir istekte görünümü sorulabilecek en çok kişi (ofiste aynı anda görünenler). */
export const EN_COK_KARAKTER_SORGUSU = 300;
