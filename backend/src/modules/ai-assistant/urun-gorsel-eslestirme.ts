/**
 * Ürün görsellerini şirketin ürün listesiyle eşleştirme — saf kurallar.
 *
 * NEDEN SUNUCUDA, GÖRSEL GÖRSEL: 2026-10-13'te bir kullanıcı 40 ürün görseli
 * gönderip "ürünlere ekle" dedi. Hızlı model 40 görseli tek bağlamda gördü,
 * tek tek tanımak yerine dosya numaralarını sırayla dağıttı (web-07..10 →
 * Softgel) ve 50 fotoğrafı yanlış ürünlere ekledi; üstelik her adımda 40
 * görseli yeniden okuyup ~10.000 birim harcattı. Burada her görsel yalnızca
 * BİR KEZ, küçük gruplar hâlinde ve ürün listesiyle yan yana modele sorulur;
 * ana sohbet görselleri hiç taşımaz.
 *
 * Bu dosyada ağ ya da veritabanı yok: istem metni, yanıtın çözümü ve karar
 * kuralları burada ki test edilebilsin (bkz. urun-gorsel-eslestirme.test.ts).
 */

// dil:atla-baslangic — buradaki metinler MODELE yazılıyor, kullanıcıya değil.

export interface EslesmeUrunu {
  id: string;
  ad: string;
  sku?: string;
  kategori?: string;
  marka?: string;
}

export type Guven = "yuksek" | "orta" | "dusuk";

export interface GorselEslesmesi {
  /** Gruptaki görselin 1'den başlayan sırası. */
  no: number;
  /** Ürün listesindeki 1'den başlayan sıra; 0 = listede karşılığı yok. */
  urun: number;
  guven: Guven;
  /** Modelin ambalajda okuduğu — eşleşmeyenleri kullanıcıya anlatmak için. */
  gorulen: string;
}

/** Bir model çağrısında kaç görsel: liste her çağrıda bir kez gider, grup büyüdükçe ucuzlar. */
export const GRUP_BOYUTU = 4;

/**
 * Eşleştirmede görselin uzun kenarı. Ambalajdaki ürün adı bu boyutta rahat
 * okunuyor; 1568'e göre görsel başına token ~%40 daha az.
 */
export const ESLESTIRME_KENARI = 1024;

/** Görsel başına girdi token'ı (1024×768 ≈ 1.050) — tahmin için. */
export const GORSEL_TOKEN_TAHMINI = 1100;

/** Görsel başına çıktı token'ı — tahmin için. */
export const CIKTI_TOKEN_TAHMINI = 70;

/** Ürün başına liste satırının yaklaşık token'ı — tahmin için. */
export const URUN_SATIRI_TOKEN_TAHMINI = 30;

/** Model ürünleri numarayla anar: kimlik (UUID) yazdırmak hem pahalı hem hataya açık. */
export function urunListesiMetni(urunler: EslesmeUrunu[]): string {
  return urunler
    .map((u, i) => {
      const ek = [u.marka, u.kategori, u.sku ? `kod ${u.sku}` : undefined].filter(Boolean).join(" · ");
      return `${i + 1}) ${u.ad}${ek ? ` (${ek})` : ""}`;
    })
    .join("\n");
}

export function eslestirmeSistemi(urunler: EslesmeUrunu[]): string {
  return [
    "Bir şirketin ürün kataloğu için fotoğrafları ürünlerle eşleştiriyorsun.",
    "Her fotoğrafta ambalajın üzerindeki ürün ADINI, FORMUNU (sprey, damla, softgel, pastil, tablet, efervesan, " +
      "sabun, krem, losyon, jel…) ve HACİM/ADEDİNİ (30 ML, 24'lü, 500 MG…) oku ve aşağıdaki listeden aynı ürünü seç.",
    "Kurallar:",
    "- Dosya adına ya da sıraya bakma; yalnızca fotoğrafta gördüğüne güven.",
    "- Ad tutuyor ama form ya da hacim farklıysa o ürün DEĞİLDİR (Vacrol Sprey ≠ Vacrol Damla).",
    "- Tek ürünün setini gösteren fotoğraf, listede set varsa sete; yoksa o ürüne gider.",
    "- Birden çok FARKLI ürünü gösteren fotoğraf (kampanya, karışık görsel): listede o kombinasyon " +
      "(paket/set) yoksa urun 0.",
    "- Ürünü okuyamıyorsan ya da listede yoksa urun 0. Tahmin YÜRÜTME: yanlış eşleşme, eşleşmemekten kötüdür.",
    "- guven: yuksek = ad + form net okunuyor; orta = ad net, form/hacim kısmen; dusuk = emin değilsin.",
    "",
    "Ürün listesi:",
    urunListesiMetni(urunler),
    "",
    "YALNIZCA şu biçimde bir JSON dizisi döndür, başka hiçbir şey yazma:",
    '[{"no":1,"urun":3,"guven":"yuksek","gorulen":"Vacrol Sprey 30 ML"}]',
  ].join("\n");
}

/**
 * Modelin yanıtını çözer. Bozuk ya da eksik satırlar atlanır: o görseller
 * "eşleşmedi" sayılır, yanlış ürüne gitmez.
 */
export function eslesmeleriCoz(metin: string, grupBoyu: number, urunSayisi: number): GorselEslesmesi[] {
  const bas = metin.indexOf("[");
  const son = metin.lastIndexOf("]");
  if (bas < 0 || son <= bas) return [];
  let ham: unknown;
  try {
    ham = JSON.parse(metin.slice(bas, son + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(ham)) return [];

  const sonuc = new Map<number, GorselEslesmesi>();
  for (const s of ham as any[]) {
    const no = Number(s?.no);
    const urun = Number(s?.urun);
    if (!Number.isInteger(no) || no < 1 || no > grupBoyu || sonuc.has(no)) continue;
    const guven: Guven = s?.guven === "yuksek" || s?.guven === "orta" ? s.guven : "dusuk";
    sonuc.set(no, {
      no,
      urun: Number.isInteger(urun) && urun >= 1 && urun <= urunSayisi ? urun : 0,
      guven,
      gorulen: String(s?.gorulen ?? "").slice(0, 120),
    });
  }
  return [...sonuc.values()].sort((a, b) => a.no - b.no);
}

/** Eklenir mi? Düşük güven EKLENMEZ: kullanıcıya sorulur. */
export function eklenecekMi(e: GorselEslesmesi | undefined): boolean {
  return !!e && e.urun > 0 && e.guven !== "dusuk";
}

/** Görselleri gruplara böler. */
export function gruplara<T>(liste: T[], boyut = GRUP_BOYUTU): T[][] {
  const gruplar: T[][] = [];
  for (let i = 0; i < liste.length; i += boyut) gruplar.push(liste.slice(i, i + boyut));
  return gruplar;
}

/** Eşleştirmenin token tahmini (kredi tahmini çağıranda, modelin fiyatıyla). */
export function eslestirmeTokenTahmini(gorselSayisi: number, urunSayisi: number): { input: number; output: number } {
  const grup = Math.ceil(gorselSayisi / GRUP_BOYUTU);
  const listeTokeni = 400 + urunSayisi * URUN_SATIRI_TOKEN_TAHMINI;
  return {
    input: grup * listeTokeni + gorselSayisi * GORSEL_TOKEN_TAHMINI,
    output: gorselSayisi * CIKTI_TOKEN_TAHMINI,
  };
}

/**
 * Base64 verinin gerçek görsel türü. Dosya adına güvenilmez: büyük görseller
 * JPEG'e çevriliyor (bkz. ai-attachments.service.ts) ama adı ".png" kalıyor;
 * yanlış tür bildirilen görseli Anthropic reddediyor.
 */
export function base64GorselTuru(base64: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | undefined {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lG")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return undefined;
}
// dil:atla-bitis
