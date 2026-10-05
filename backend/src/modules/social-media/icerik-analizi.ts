/**
 * İçerik analizinin saf kuralları: Instagram'dan hangi metrikler istenir,
 * yanıt nasıl okunur, Lio'ya ne söylenir, Lio'nun yanıtı nasıl okunur.
 *
 * Servisten AYRI, çünkü veritabanı, Meta ya da sağlayıcı taklidi olmadan test
 * edilebilmeli (lio-oneri.ts ile aynı gerekçe). "İyi gitti mi" hesabı ise
 * arayüzle ortak olduğu için packages/shared/src/icerikAnalizi.ts'te.
 */
import type {
  SocialAccountMediaItem,
  SocialIdea,
  SocialIdeaPattern,
  SocialIdeaReportContent,
  SocialInspiration,
} from "@projelio/shared";
import { icerikTuru, kaydetPaylasOrani, performanslar, turOzeti } from "@projelio/shared";
import { jsonuAyikla } from "./lio-oneri";

// ============================================================ Instagram metrikleri

/**
 * Medya türüne göre istenecek metrik listeleri — sırayla denenir.
 *
 * NEDEN BİRDEN ÇOK LİSTE: Insights ucu, listedeki TEK bir metrik o tür için
 * desteklenmiyorsa isteğin tamamını (#100) reddediyor. Meta da metrikleri
 * sık değiştiriyor (2025'te `plays`, `impressions`, `video_views` kaldırıldı,
 * yerine `views` geldi). İlk liste dolu olanı, sonrakiler giderek daha temel;
 * biri tutarsa o gönderi için yeterli.
 */
export function metrikListeleri(mediaProductType?: string | null): string[][] {
  const temel = ["reach", "saved", "shares"];
  if (mediaProductType === "REELS") {
    return [
      [
        "views",
        "reach",
        "likes",
        "comments",
        "saved",
        "shares",
        "total_interactions",
        "ig_reels_avg_watch_time",
        "ig_reels_video_view_total_time",
      ],
      ["views", "reach", "saved", "shares", "total_interactions"],
      temel,
    ];
  }
  if (mediaProductType === "STORY") return [["views", "reach"], ["reach"]];
  // Beğeni/yorum Insights'tan da okunuyor: saatlik takip gönderi listesini
  // çekmeden yalnızca bu uca gidiyor, büyüme eğrisinde onlar da olsun.
  return [["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"], ["views", "reach", "saved", "shares", "total_interactions"], temel];
}

export interface OkunanMetrikler {
  likes?: number;
  comments?: number;
  reach?: number;
  views?: number;
  saved?: number;
  shares?: number;
  totalInteractions?: number;
  avgWatchTimeMs?: number;
  totalWatchTimeMs?: number;
}

const METRIK_ALANI: Record<string, keyof OkunanMetrikler> = {
  likes: "likes",
  comments: "comments",
  reach: "reach",
  views: "views",
  saved: "saved",
  shares: "shares",
  total_interactions: "totalInteractions",
  ig_reels_avg_watch_time: "avgWatchTimeMs",
  ig_reels_video_view_total_time: "totalWatchTimeMs",
};

/**
 * Insights yanıtını okur.
 *
 * Meta iki biçim kullanıyor: eski metrikler `values[0].value`, yenileri
 * `total_value.value`. İkisi de kabul edilir; sayı olmayan değer yok sayılır.
 */
export function insightsYanitiniOku(json: unknown): OkunanMetrikler {
  const sonuc: OkunanMetrikler = {};
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return sonuc;
  for (const oge of data as any[]) {
    const alan = METRIK_ALANI[oge?.name];
    if (!alan) continue;
    const ham = oge?.total_value?.value ?? (Array.isArray(oge?.values) ? oge.values[0]?.value : undefined);
    const sayi = typeof ham === "number" ? ham : typeof ham === "string" ? Number(ham) : NaN;
    if (Number.isFinite(sayi)) sonuc[alan] = Math.round(sayi);
  }
  return sonuc;
}

export interface IgMedya {
  id: string;
  caption?: string;
  mediaType?: string;
  mediaProductType?: string;
  timestamp?: string;
  permalink?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  likeCount?: number;
  commentsCount?: number;
}

/** `/me/media` sayfasını okur; bir sonraki sayfanın adresiyle. */
export function medyaSayfasiniOku(json: unknown): { medya: IgMedya[]; sonraki: string | null } {
  const j = json as { data?: any[]; paging?: { next?: string } };
  const medya = (Array.isArray(j?.data) ? j.data : [])
    .filter((m) => m && typeof m.id === "string")
    .map((m) => ({
      id: m.id,
      caption: typeof m.caption === "string" ? m.caption : undefined,
      mediaType: m.media_type,
      mediaProductType: m.media_product_type,
      timestamp: metaZamani(m.timestamp) ?? undefined,
      permalink: m.permalink,
      // Videoda kapak `thumbnail_url`; görselde `media_url` zaten görselin kendisi.
      thumbnailUrl: m.thumbnail_url ?? (m.media_type === "VIDEO" ? undefined : m.media_url),
      mediaUrl: m.media_url,
      likeCount: typeof m.like_count === "number" ? m.like_count : undefined,
      commentsCount: typeof m.comments_count === "number" ? m.comments_count : undefined,
    }));
  return { medya, sonraki: typeof j?.paging?.next === "string" ? j.paging.next : null };
}

/**
 * Meta'nın zaman biçimi "2026-09-20T18:00:00+0000" — iki noktasız ofset.
 * Her ortamın Date'i bunu okumuyor; ISO'ya çevrilip UTC olarak yazılır
 * (veritabanı sözleşmesi: timestamp sütunlarında UTC, bkz. migration 127).
 */
export function metaZamani(ham: unknown): string | null {
  if (typeof ham !== "string" || !ham) return null;
  const duzgun = ham.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const zaman = Date.parse(duzgun);
  return Number.isFinite(zaman) ? new Date(zaman).toISOString() : null;
}

/**
 * Meta hata kodundan "bu hesabın izni yok" kararı.
 *
 * #10 ve #200 izin hataları: bağlantı Insights izni verilmeden kurulmuş
 * (migration 145'ten önce bağlanan hesaplar) ya da kullanıcı izni geri almış.
 * Bu durumda tek tek gönderileri denemek boşuna — hesap düzeyinde "yeniden
 * bağlan" denir. #190 jeton geçersiz: yayın akışıyla aynı, bağlantı kopuk.
 */
export function metaHataTuru(govde: string): "izin" | "jeton" | "diger" {
  try {
    const kod = (JSON.parse(govde) as { error?: { code?: number } }).error?.code;
    if (kod === 10 || kod === 200) return "izin";
    if (kod === 190) return "jeton";
  } catch {
    // gövde JSON değil
  }
  return "diger";
}

// ============================================================ Lio: gönderi analizi

export class AnalizOkunamadi extends Error {}

const metinListesi = (ham: unknown, tavan: number): string[] =>
  (Array.isArray(ham) ? ham : [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().slice(0, 400))
    .slice(0, tavan);

const metin = (ham: unknown, tavan: number): string => (typeof ham === "string" ? ham.trim().slice(0, tavan) : "");

export interface GonderiAnaliziBaglami {
  dil: "tr" | "en";
  handle: string;
  tonNotu?: string | null;
  kitleNotu?: string | null;
  gonderi: SocialAccountMediaItem;
  /** Hesabın normaline göre kat ("3,2 kat") — hesaplanamadıysa null. */
  kat: number | null;
  /** Hesabın medyan değeri ve kıyasta kaç gönderi var. */
  hesapMedyani: number | null;
  sesDokumu?: string | null;
  /** Lio'nun gördüğü medyanın türü — kareler mi, yalnızca kapak mı. */
  medyaNotu: string;
}

export function gonderiAnaliziSistemi(dil: "tr" | "en"): string {
  const dilAdi = dil === "en" ? "English" : "Türkçe";
  return [
    "Sen Projelio'nun asistanı Lio'sun ve bir sosyal medya içerik stratejisti gibi çalışıyorsun.",
    "Sana kullanıcının KENDİ Instagram hesabından bir gönderinin karelerini (ya da kapağını), varsa konuşma dökümünü, açıklamasını ve Instagram'dan okunan metriklerini vereceğim.",
    "Görevin: bu gönderinin neden bu performansı gösterdiğini açıklamak ve sonraki içerikler için somut ders çıkarmak.",
    "- Metrikleri hesabın kendi normaliyle kıyasla (verilen 'kat' değeri). Mutlak sayılara takılma.",
    "- Açılışı (ilk kare / ilk cümle / açıklamanın ilk satırı) ayrıca değerlendir: dikkat çekiyor mu, neden?",
    "- Kaydetme ve paylaşım oranını önemse: izlenmeden daha güçlü bir kalite sinyali.",
    "- Ortalama izlenme süresi verildiyse videonun süresiyle birlikte yorumla.",
    "- Görmediğin bir şeyi uydurma. Kesin olmayan çıkarımları 'muhtemelen' diye belirt.",
    "- Maddeler kısa ve uygulanabilir olsun; genel geçer tavsiye ('kaliteli içerik üret') yazma.",
    `- Dil: ${dilAdi}.`,
    "",
    "YALNIZCA şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
    '{"gorulen": "1-2 cümle: gönderide ne var", "hook": "açılışın değerlendirmesi, 1-2 cümle", "nedenler": ["..."], "tekrarla": ["..."], "gelistir": ["..."]}',
    "nedenler 2-4, tekrarla 1-3, gelistir 1-3 madde.",
  ].join("\n");
}

export function gonderiAnaliziIstemi(b: GonderiAnaliziBaglami): string {
  const g = b.gonderi;
  const satirlar = [`Hesap: @${b.handle}`];
  if (b.tonNotu) satirlar.push(`Ton notu: ${b.tonNotu}`);
  if (b.kitleNotu) satirlar.push(`Kitle notu: ${b.kitleNotu}`);
  satirlar.push(`Tür: ${icerikTuru(g)}`);
  if (g.postedAt) satirlar.push(`Paylaşım zamanı (UTC): ${g.postedAt}`);
  satirlar.push("", "Metrikler:");
  satirlar.push(...metrikSatirlari(g));
  if (b.kat !== null && b.hesapMedyani !== null) {
    satirlar.push(`Hesabın normali (medyan izlenme/erişim): ${Math.round(b.hesapMedyani)} — bu gönderi normalin ${b.kat} katı.`);
  } else {
    satirlar.push("Hesabın normaliyle kıyas yapılamadı (yeni gönderi ya da yeterli veri yok).");
  }
  satirlar.push("", b.medyaNotu);
  if (g.caption) satirlar.push("", "Açıklama metni:", g.caption.slice(0, 2200));
  if (b.sesDokumu) satirlar.push("", "Konuşma dökümü:", b.sesDokumu.slice(0, 6000));
  return satirlar.join("\n");
}

function metrikSatirlari(g: SocialAccountMediaItem): string[] {
  const s: string[] = [];
  const ekle = (ad: string, deger?: number) => {
    if (typeof deger === "number") s.push(`- ${ad}: ${deger}`);
  };
  ekle("İzlenme", g.views);
  ekle("Erişim", g.reach);
  ekle("Beğeni", g.likeCount);
  ekle("Yorum", g.commentsCount);
  ekle("Kaydetme", g.saved);
  ekle("Paylaşım", g.shares);
  if (typeof g.avgWatchTimeMs === "number") s.push(`- Ortalama izlenme süresi: ${(g.avgWatchTimeMs / 1000).toFixed(1)} sn`);
  const oran = kaydetPaylasOrani(g);
  if (oran !== null) s.push(`- (Kaydetme+paylaşım)/erişim: %${(oran * 100).toFixed(1)}`);
  return s.length ? s : ["- (metrik okunamadı)"];
}

export interface OkunanGonderiAnalizi {
  gorulen?: string;
  hook: string;
  nedenler: string[];
  tekrarla: string[];
  gelistir: string[];
}

export function gonderiAnaliziniCoz(yanit: string): OkunanGonderiAnalizi {
  const ham = jsonuAyikla(yanit) as Record<string, unknown> | null;
  if (!ham || typeof ham !== "object") throw new AnalizOkunamadi("Lio bir analiz üretemedi, tekrar dene."); // dil:anahtar
  const sonuc = {
    gorulen: metin(ham.gorulen, 600) || undefined,
    hook: metin(ham.hook, 600),
    nedenler: metinListesi(ham.nedenler, 5),
    tekrarla: metinListesi(ham.tekrarla, 4),
    gelistir: metinListesi(ham.gelistir, 4),
  };
  if (!sonuc.hook && sonuc.nedenler.length === 0) {
    throw new AnalizOkunamadi("Lio bir analiz üretemedi, tekrar dene."); // dil:anahtar
  }
  return sonuc;
}

// ============================================================ Lio: ilham analizi

export interface IlhamAnaliziBaglami {
  dil: "tr" | "en";
  ilham: Pick<SocialInspiration, "kind" | "platform" | "url" | "handle" | "title" | "note" | "tags">;
  /** Kullanıcının kendi hesap(lar)ı — uyarlama önerisi onlara göre. */
  hesaplar: { handle: string; tonNotu?: string | null; kitleNotu?: string | null }[];
  sesDokumu?: string | null;
  medyaNotu: string;
}

export function ilhamAnaliziSistemi(dil: "tr" | "en"): string {
  const dilAdi = dil === "en" ? "English" : "Türkçe";
  return [
    "Sen Projelio'nun asistanı Lio'sun ve bir sosyal medya içerik stratejisti gibi çalışıyorsun.",
    "Kullanıcı, beğendiği BAŞKA bir hesabın içeriğini ilham kaynağı olarak kaydetti. Sana varsa referans videonun karelerini / görseli, konuşma dökümünü ve kullanıcının notlarını vereceğim.",
    "Görevin: bu içeriğin neden işlediğini çözümlemek ve kullanıcının KENDİ hesabına nasıl uyarlanabileceğini önermek.",
    "- Kopyalamayı önerme; formatı, yapıyı ve psikolojik tetikleyiciyi çıkar, kullanıcının konusuna ve tonuna uyarla.",
    "- Açılışı (hook) ve akışı (açılış → gelişme → kapanış/eylem çağrısı) ayrı ayrı anlat.",
    "- Elinde yalnızca not varsa yalnızca nota dayan; görmediğin bir şeyi uydurma.",
    `- Dil: ${dilAdi}.`,
    "",
    "YALNIZCA şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
    '{"gorulen": "1-2 cümle: içerikte ne var", "hook": "açılış ve neden dikkat çekiyor", "yapi": "akışın kısa anlatımı", "nedenIsliyor": ["..."], "uyarla": ["..."]}',
    "nedenIsliyor 2-4, uyarla 2-4 madde. uyarla maddeleri doğrudan çekilebilecek somut içerik önerileri olsun.",
  ].join("\n");
}

export function ilhamAnaliziIstemi(b: IlhamAnaliziBaglami): string {
  const i = b.ilham;
  const satirlar = [
    `İlham türü: ${i.kind === "account" ? "takip edilen hesap" : "tek içerik"} (${i.platform})`,
    `Başlık: ${i.title}`,
  ];
  if (i.handle) satirlar.push(`Hesap: @${i.handle}`);
  if (i.url) satirlar.push(`Bağlantı (açılamaz, yalnızca bilgi): ${i.url}`);
  if (i.tags) satirlar.push(`Kullanıcının etiketleri: ${i.tags}`);
  if (i.note) satirlar.push("", "Kullanıcının notu:", i.note.slice(0, 3000));
  satirlar.push("", b.medyaNotu);
  if (b.sesDokumu) satirlar.push("", "Konuşma dökümü:", b.sesDokumu.slice(0, 6000));
  satirlar.push(...hesapSatirlari(b.hesaplar));
  return satirlar.join("\n");
}

export interface OkunanIlhamAnalizi {
  gorulen?: string;
  hook: string;
  yapi: string;
  nedenIsliyor: string[];
  uyarla: string[];
}

export function ilhamAnaliziniCoz(yanit: string): OkunanIlhamAnalizi {
  const ham = jsonuAyikla(yanit) as Record<string, unknown> | null;
  if (!ham || typeof ham !== "object") throw new AnalizOkunamadi("Lio bir analiz üretemedi, tekrar dene."); // dil:anahtar
  const sonuc = {
    gorulen: metin(ham.gorulen, 600) || undefined,
    hook: metin(ham.hook, 600),
    yapi: metin(ham.yapi, 800),
    nedenIsliyor: metinListesi(ham.nedenIsliyor, 5),
    uyarla: metinListesi(ham.uyarla, 5),
  };
  if (!sonuc.hook && sonuc.uyarla.length === 0) {
    throw new AnalizOkunamadi("Lio bir analiz üretemedi, tekrar dene."); // dil:anahtar
  }
  return sonuc;
}

// ============================================================ Lio: fikir raporu

/** Rapora giren en iyi / en zayıf gönderi sayısı — istemin boyunu sınırlar. */
export const RAPOR_EN_IYI = 8;
export const RAPOR_EN_ZAYIF = 4;
export const RAPOR_ILHAM_TAVANI = 15;

export interface FikirRaporuBaglami {
  dil: "tr" | "en";
  hesaplar: { accountId: string; handle: string; tonNotu?: string | null; kitleNotu?: string | null; takipci?: number | null }[];
  medya: SocialAccountMediaItem[];
  ilhamlar: SocialInspiration[];
  istek?: string | null;
  simdi: Date;
}

export function fikirRaporuSistemi(dil: "tr" | "en"): string {
  const dilAdi = dil === "en" ? "English" : "Türkçe";
  return [
    "Sen Projelio'nun asistanı Lio'sun ve bir sosyal medya içerik stratejisti gibi çalışıyorsun.",
    "Sana kullanıcının kendi Instagram hesabının verisini (en iyi ve en zayıf gönderileri, tür özetleri, önceki analizler) ve kaydettiği ilham kaynaklarını vereceğim.",
    "Görevin: veriden kalıpları çıkarmak ve bu kalıplara + ilhamlara dayanan yeni içerik fikirleri üretmek.",
    "- Kalıplar veriye dayansın: hangi konu, format, açılış, süre ya da paylaşım saati normalin üstünde gidiyor? Hangi veriye dayandığını kısaca söyle.",
    "- Fikirler doğrudan çekilebilecek kadar somut olsun: başlık, ilk cümle/ilk sahne (hook), format ve neden işe yarayabileceği.",
    "- İlham kaynaklarını kopyalama; formatlarını kullanıcının konusuna uyarla. Bir fikir ilhamdan geliyorsa 'neden' alanında belirt.",
    "- Veri azsa bunu özet bölümünde açıkça söyle ve fikirleri daha çok ilhamlara ve hesap notlarına dayandır.",
    "- Kullanıcının bir isteği varsa raporu ona göre şekillendir.",
    `- Dil: ${dilAdi}.`,
    "",
    "YALNIZCA şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
    '{"ozet": "3-5 cümlelik durum özeti", "kaliplar": [{"baslik": "...", "aciklama": "..."}], "fikirler": [{"baslik": "...", "hook": "...", "format": "...", "neden": "..."}]}',
    "kaliplar 2-5, fikirler 6-10 madde.",
  ].join("\n");
}

export function fikirRaporuIstemi(b: FikirRaporuBaglami): string {
  const satirlar: string[] = [];
  satirlar.push(...hesapSatirlari(b.hesaplar.map((h) => ({ ...h }))));
  for (const h of b.hesaplar) {
    if (typeof h.takipci === "number") satirlar.push(`@${h.handle} takipçi: ${h.takipci}`);
  }

  const perf = performanslar(b.medya, b.simdi);
  const olcullu = b.medya
    .map((m) => ({ m, kat: perf.get(m.id)?.kat ?? null }))
    .filter((x): x is { m: SocialAccountMediaItem; kat: number } => x.kat !== null);
  olcullu.sort((a, c) => c.kat - a.kat);

  satirlar.push("", `Toplam gönderi: ${b.medya.length}, kıyaslanabilen: ${olcullu.length}`);
  const turler = turOzeti(b.medya, b.simdi);
  if (turler.length) {
    satirlar.push("Türlere göre (adet / medyan izlenme-erişim):");
    for (const t of turler) satirlar.push(`- ${t.tur}: ${t.adet} / ${t.medyanDeger === null ? "-" : Math.round(t.medyanDeger)}`);
  }

  const enIyi = olcullu.slice(0, RAPOR_EN_IYI);
  const enZayif = olcullu.length > RAPOR_EN_IYI ? olcullu.slice(-RAPOR_EN_ZAYIF).reverse() : [];
  if (enIyi.length) {
    satirlar.push("", "EN İYİ GÖNDERİLER (normalin katı):");
    for (const x of enIyi) satirlar.push(...gonderiOzeti(x.m, x.kat));
  }
  if (enZayif.length) {
    satirlar.push("", "EN ZAYIF GÖNDERİLER:");
    for (const x of enZayif) satirlar.push(...gonderiOzeti(x.m, x.kat));
  }

  const ilhamlar = b.ilhamlar.slice(0, RAPOR_ILHAM_TAVANI);
  if (ilhamlar.length) {
    satirlar.push("", "İLHAM KAYNAKLARI:");
    for (const i of ilhamlar) {
      satirlar.push(`- ${i.title}${i.handle ? ` (@${i.handle})` : ""}${i.tags ? ` [${i.tags}]` : ""}`);
      if (i.note) satirlar.push(`  Not: ${i.note.slice(0, 400)}`);
      if (i.lioAnaliz) {
        satirlar.push(`  Hook: ${i.lioAnaliz.hook}`);
        if (i.lioAnaliz.nedenIsliyor.length) satirlar.push(`  Neden işliyor: ${i.lioAnaliz.nedenIsliyor.join("; ")}`);
      }
    }
  } else {
    satirlar.push("", "İlham kaynağı kaydedilmemiş.");
  }

  if (b.istek?.trim()) satirlar.push("", `Kullanıcının isteği: ${b.istek.trim().slice(0, 500)}`);
  return satirlar.join("\n");
}

function gonderiOzeti(m: SocialAccountMediaItem, kat: number): string[] {
  const s = [`- ${kat}x · ${icerikTuru(m)}${m.postedAt ? ` · ${m.postedAt.slice(0, 16)} UTC` : ""}`];
  const metrik: string[] = [];
  if (typeof m.views === "number") metrik.push(`izlenme ${m.views}`);
  if (typeof m.reach === "number") metrik.push(`erişim ${m.reach}`);
  if (typeof m.saved === "number") metrik.push(`kaydetme ${m.saved}`);
  if (typeof m.shares === "number") metrik.push(`paylaşım ${m.shares}`);
  if (typeof m.avgWatchTimeMs === "number") metrik.push(`ort. izlenme ${(m.avgWatchTimeMs / 1000).toFixed(1)} sn`);
  if (metrik.length) s.push(`  ${metrik.join(", ")}`);
  if (m.caption) s.push(`  Açıklama: ${m.caption.replace(/\s+/g, " ").slice(0, 300)}`);
  if (m.lioAnaliz) {
    s.push(`  Lio analizi — hook: ${m.lioAnaliz.hook}`);
    if (m.lioAnaliz.nedenler.length) s.push(`  Nedenler: ${m.lioAnaliz.nedenler.join("; ")}`);
  }
  return s;
}

function hesapSatirlari(hesaplar: { handle: string; tonNotu?: string | null; kitleNotu?: string | null }[]): string[] {
  if (hesaplar.length === 0) return [];
  const s = ["", "Kullanıcının hesap(lar)ı:"];
  for (const h of hesaplar) {
    s.push(`- @${h.handle}`);
    if (h.tonNotu) s.push(`  Ton notu: ${h.tonNotu}`);
    if (h.kitleNotu) s.push(`  Kitle notu: ${h.kitleNotu}`);
  }
  return s;
}

export function fikirRaporunuCoz(yanit: string): SocialIdeaReportContent {
  const ham = jsonuAyikla(yanit) as Record<string, unknown> | null;
  if (!ham || typeof ham !== "object") throw new AnalizOkunamadi("Lio bir rapor üretemedi, tekrar dene."); // dil:anahtar

  const kaliplar: SocialIdeaPattern[] = (Array.isArray(ham.kaliplar) ? ham.kaliplar : [])
    .map((k: any) => ({ baslik: metin(k?.baslik, 200), aciklama: metin(k?.aciklama, 800) }))
    .filter((k) => k.baslik)
    .slice(0, 6);
  const fikirler: SocialIdea[] = (Array.isArray(ham.fikirler) ? ham.fikirler : [])
    .map((f: any) => ({
      baslik: metin(f?.baslik, 200),
      hook: metin(f?.hook, 400),
      format: metin(f?.format, 120),
      neden: metin(f?.neden, 600),
    }))
    .filter((f) => f.baslik)
    .slice(0, 12);

  if (fikirler.length === 0) throw new AnalizOkunamadi("Lio bir rapor üretemedi, tekrar dene."); // dil:anahtar
  return { ozet: metin(ham.ozet, 1500), kaliplar, fikirler };
}
