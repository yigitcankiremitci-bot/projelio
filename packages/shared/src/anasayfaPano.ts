// Anasayfa panosunun düzeni: hangi özet kartı, hangi sırada, hangi boyutta.
//
// Burada yalnızca GÖRÜNEN kartlar tutulur; listede olmayan kart "kart ekle"
// rafında bekliyor demektir. Ayrı bir "gizli" listesi yok, çünkü sonradan
// açılan her modül rafa kendiliğinden düşmeli ve kimsenin düzenini bozmamalı.
//
// Kart kimlikleri bilinçli olarak katalogla KARŞILAŞTIRILMIYOR: katalog
// kullanıcının yetkisine ve açık modüllerine göre değişiyor, üstelik ilk
// boyamada henüz gelmemiş olabiliyor. Süzmek, yetkisi bir süreliğine düşen
// birinin düzenini kalıcı olarak silerdi; görünmeyen kart yalnızca çizilmez.

export const PANO_BOYUTLARI = ["kucuk", "orta", "genis"] as const;
export type PanoBoyut = (typeof PANO_BOYUTLARI)[number];

export interface PanoKart {
  id: string;
  boyut: PanoBoyut;
}

/** Hesaba yazılan satırın büyümemesi için tavan; katalog bunun çok altında. */
export const PANO_EN_COK_KART = 40;

const KART_KIMLIGI = /^[a-z0-9_.:-]{1,80}$/i;

/**
 * Kayıtlı düzeni okur. Geçersiz kayıtta `null` döner, BOŞ dizide değil:
 * kullanıcının bütün kartları kaldırdığı pano geçerli bir tercih ve
 * varsayılana dönmemeli.
 */
export function panoDuzeniniCoz(ham: unknown): PanoKart[] | null {
  if (!Array.isArray(ham)) return null;
  const sonuc: PanoKart[] = [];
  const gorulen = new Set<string>();
  for (const oge of ham) {
    if (sonuc.length >= PANO_EN_COK_KART) break;
    const id = (oge as { id?: unknown } | null)?.id;
    const boyut = (oge as { boyut?: unknown } | null)?.boyut;
    if (typeof id !== "string" || !KART_KIMLIGI.test(id) || gorulen.has(id)) continue;
    gorulen.add(id);
    sonuc.push({ id, boyut: PANO_BOYUTLARI.includes(boyut as PanoBoyut) ? (boyut as PanoBoyut) : "kucuk" });
  }
  return sonuc;
}

/**
 * Sürükleme sonrası sıra. Ekranda çizilmeyen kartlar (yetkisi düşmüş, modülü
 * kapanmış) sona alınır ama SİLİNMEZ: geri geldiklerinde yerleri bellidir.
 */
export function panoSirala(kartlar: PanoKart[], ekrandakiSira: string[]): PanoKart[] {
  const kimlikle = new Map(kartlar.map((k) => [k.id, k]));
  const sirali = ekrandakiSira.map((id) => kimlikle.get(id)).filter((k): k is PanoKart => Boolean(k));
  const yerlesen = new Set(sirali.map((k) => k.id));
  return [...sirali, ...kartlar.filter((k) => !yerlesen.has(k.id))];
}

export function panoKartEkle(kartlar: PanoKart[], id: string, boyut: PanoBoyut = "kucuk"): PanoKart[] {
  if (kartlar.some((k) => k.id === id) || kartlar.length >= PANO_EN_COK_KART) return kartlar;
  return [...kartlar, { id, boyut }];
}

export function panoKartKaldir(kartlar: PanoKart[], id: string): PanoKart[] {
  return kartlar.filter((k) => k.id !== id);
}

export function panoBoyutAyarla(kartlar: PanoKart[], id: string, boyut: PanoBoyut): PanoKart[] {
  return kartlar.map((k) => (k.id === id ? { ...k, boyut } : k));
}

/** Pano kapsamı: serbest çalışanın kendi panosu ("me") ya da bir şirketin kimliği. */
export function panoKapsamiGecerliMi(kapsam: unknown): kapsam is string {
  return (
    kapsam === "me" ||
    (typeof kapsam === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(kapsam))
  );
}
