/**
 * Anasayfa panosunun Haber, Döviz ve Borsa kartları için saf ayrıştırıcılar.
 *
 * Kaynaklar (kullanıcı kararı, 2026-11-09):
 * - Döviz: TCMB günlük bülteni — resmî ve makine için yayımlanıyor (bkz.
 *   billing/tcmb-kuru.ts, aynı bülten).
 * - Haber: TRT Haber, AA ve BBC Türkçe RSS akışları; kart üstünde Gündem /
 *   Ekonomi diye süzülür.
 * - Borsa: Yahoo Finance'in grafik ucu. RESMÎ DEĞİL: BIST'in ücretsiz bir
 *   API'si yok. Yahoo ucu kapatır ya da biçimini değiştirirse kart "yüklenemedi"
 *   der, başka hiçbir şey etkilenmez — bu yüzden ayrıştırıcı bozuk girdide
 *   istisna fırlatmaz, null döner.
 *
 * XML düz metin olarak ayrıştırılıyor: üç alan için bağımlılık eklemeye değmez.
 */

export type HaberTuru = "gundem" | "ekonomi";

export interface HaberKaynagi {
  ad: string;
  adres: string;
}

export const HABER_KAYNAKLARI: Record<HaberTuru, HaberKaynagi[]> = {
  gundem: [
    { ad: "TRT Haber", adres: "https://www.trthaber.com/manset_articles.rss" },
    { ad: "AA", adres: "https://www.aa.com.tr/tr/rss/default?cat=guncel" },
    { ad: "BBC Türkçe", adres: "https://feeds.bbci.co.uk/turkce/rss.xml" },
  ],
  ekonomi: [
    { ad: "TRT Haber", adres: "https://www.trthaber.com/ekonomi_articles.rss" },
    { ad: "AA", adres: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi" },
  ],
};

export function haberTuruMu(deger: unknown): deger is HaberTuru {
  return deger === "gundem" || deger === "ekonomi";
}

export interface Haber {
  baslik: string;
  baglanti: string;
  kaynak: string;
  /** ISO tarih; akışta yoksa boş. */
  tarih: string;
  /** Kapak görseli (varsa). */
  gorsel?: string;
}

const VARLIKLAR: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function metinCoz(ham: string | undefined): string {
  if (!ham) return "";
  return ham
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (tam, ad) => VARLIKLAR[ad.toLowerCase()] ?? tam)
    .replace(/\s+/g, " ")
    .trim();
}

function etiket(blok: string, ad: string): string | undefined {
  return new RegExp(`<${ad}\\b[^>]*>([\\s\\S]*?)</${ad}>`).exec(blok)?.[1];
}

/** RSS 2.0 akışındaki öğeler. Bağlantısı http(s) olmayan öğe atlanır: karta basınca bir yere gitmeli. */
export function rssAyikla(xml: string, kaynak: string): Haber[] {
  if (!xml) return [];
  const sonuc: Haber[] = [];
  for (const eslesme of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const blok = eslesme[1];
    const baslik = metinCoz(etiket(blok, "title"));
    // TRT Haber <link> yazmıyor, adres <guid>'de; AA'nın guid'i ise sayı.
    const baglanti = [metinCoz(etiket(blok, "link")), metinCoz(etiket(blok, "guid"))].find((u) => /^https?:\/\//.test(u));
    if (!baslik || !baglanti) continue;
    const tarihHam = metinCoz(etiket(blok, "pubDate"));
    const zaman = tarihHam ? Date.parse(tarihHam) : NaN;
    const gorsel = /<media:content\b[^>]*\burl="([^"]+)"/.exec(blok)?.[1] ?? /<enclosure\b[^>]*\burl="([^"]+)"[^>]*type="image/.exec(blok)?.[1];
    sonuc.push({ baslik, baglanti, kaynak, tarih: Number.isNaN(zaman) ? "" : new Date(zaman).toISOString(), ...(gorsel ? { gorsel: metinCoz(gorsel) } : {}) });
  }
  return sonuc;
}

/** Birden çok akışı karıştırır: en yeni önce, aynı başlık bir kez. */
export function haberleriBirlestir(listeler: Haber[][], tavan: number): Haber[] {
  const gorulen = new Set<string>();
  return listeler
    .flat()
    .sort((a, b) => b.tarih.localeCompare(a.tarih))
    .filter((h) => {
      const anahtar = h.baslik.toLocaleLowerCase("tr");
      if (gorulen.has(anahtar)) return false;
      gorulen.add(anahtar);
      return true;
    })
    .slice(0, tavan);
}

// ─── Döviz ───────────────────────────────────────────────────────────────────

/** Kartta gösterilen birimler, sırasıyla. */
export const DOVIZ_KODLARI = ["USD", "EUR", "GBP", "CHF"] as const;

export interface DovizKuru {
  kod: string;
  /** Döviz alış / satış (TL). */
  alis: number;
  satis: number;
}

export interface DovizBulteni {
  /** Bültenin tarihi, XML'de yazdığı gibi: "09.11.2026". */
  tarih: string;
  kurlar: DovizKuru[];
}

function sayi(ham: string | undefined): number | null {
  if (!ham) return null;
  const deger = Number(ham.trim());
  return Number.isFinite(deger) && deger > 0 ? deger : null;
}

/**
 * TCMB bülteninden istenen birimler. Bulunamayan birim atlanır; hiçbiri yoksa
 * null (hafta sonu ve tatilde bülten bir önceki iş gününü gösterir, o da olur).
 */
export function dovizBulteniAyikla(xml: string, kodlar: readonly string[] = DOVIZ_KODLARI): DovizBulteni | null {
  if (!xml) return null;
  const tarih = /<Tarih_Date[^>]*\sTarih="([^"]+)"/.exec(xml)?.[1]?.trim() ?? "";
  const kurlar: DovizKuru[] = [];
  for (const kod of kodlar) {
    // Yalnızca o birimin bloğu: tüm belgede aramak bir sonrakinin değerini yakalardı.
    const blok = new RegExp(`<Currency\\b[^>]*\\bKod="${kod}"[^>]*>([\\s\\S]*?)</Currency>`).exec(xml)?.[1];
    if (!blok) continue;
    const alis = sayi(etiket(blok, "ForexBuying"));
    const satis = sayi(etiket(blok, "ForexSelling"));
    if (alis !== null && satis !== null) kurlar.push({ kod, alis, satis });
  }
  return kurlar.length ? { tarih, kurlar } : null;
}

// ─── Borsa ───────────────────────────────────────────────────────────────────

export const BORSA_SEMBOLLERI = [
  { sembol: "XU100.IS", ad: "BIST 100" },
  { sembol: "XU030.IS", ad: "BIST 30" },
  { sembol: "GC=F", ad: "Altın (ons)" },
  { sembol: "BZ=F", ad: "Brent" },
] as const;

export interface BorsaGostergesi {
  sembol: string;
  ad: string;
  fiyat: number;
  /** Önceki kapanışa göre yüzde değişim. */
  degisim: number;
  paraBirimi: string;
}

/** Yahoo'nun /v8/finance/chart yanıtından fiyat ve günlük değişim. */
export function yahooGrafikAyikla(json: unknown, ad: string): BorsaGostergesi | null {
  const meta = (json as { chart?: { result?: { meta?: Record<string, unknown> }[] } } | null)?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const fiyat = Number(meta.regularMarketPrice);
  const onceki = Number(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return null;
  const degisim = Number.isFinite(onceki) && onceki > 0 ? ((fiyat - onceki) / onceki) * 100 : 0;
  return { sembol: String(meta.symbol ?? ""), ad, fiyat, degisim: Math.round(degisim * 100) / 100, paraBirimi: String(meta.currency ?? "") };
}
