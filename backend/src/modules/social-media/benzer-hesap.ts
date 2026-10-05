/**
 * "Benzer hesap bul"un saf kuralları: Lio'ya ne söylenir, yanıtı nasıl okunur,
 * hangi aday "doğrulandı" sayılır.
 *
 * NEDEN DOĞRULAMA: model web araması yapsa bile JSON'a aramada görmediği bir
 * hesap adı ya da uydurma bir kaynak yazabilir. Bir aday ancak kaynağı bu
 * keşifte GERÇEKTEN dönen arama sonuçlarından biriyse "doğrulandı" sayılır;
 * değilse kaynak düşer ve arayüz adayı "kontrol et" diye işaretler. Kullanıcı
 * yanlış bir hesabı ilham panosuna eklemeden önce bunu görmeli.
 */
import type { SocialDiscoveryCandidate, SocialPlatform } from "@projelio/shared";
import { normalizeSocialHandle } from "@projelio/shared";
import { jsonuAyikla } from "./lio-oneri";

/** Bir keşifte en fazla bu kadar web araması (her biri ayrı ücret). */
export const MAX_ARAMA = 5;
export const MAX_ADAY = 12;

/** Instagram kullanıcı adı kuralı: harf, rakam, nokta, alt çizgi; en çok 30. */
const KULLANICI_ADI = /^[a-z0-9._]{1,30}$/;

const PLATFORMLAR = new Set<SocialPlatform>(["instagram", "tiktok", "youtube", "x", "threads", "facebook", "linkedin"]);

export class KesifOkunamadi extends Error {}

export interface KesifBaglami {
  dil: "tr" | "en";
  hesaplar: { handle: string; tonNotu?: string | null; kitleNotu?: string | null; takipci?: number | null }[];
  /** En iyi giden gönderilerin açıklamaları (kısa), tür ve "normalin katı". */
  enIyiler: { tur: string; kat: number | null; aciklama: string }[];
  /** İlham panosundaki hesaplar — tarzı anlatır ve sonuçtan çıkarılır. */
  ilhamlar: { handle?: string; title: string; note?: string }[];
  istek?: string | null;
}

export function kesifSistemi(dil: "tr" | "en"): string {
  const dilAdi = dil === "en" ? "English" : "Türkçe";
  return [
    "Sen Projelio'nun asistanı Lio'sun ve bir sosyal medya araştırmacısı gibi çalışıyorsun.",
    "Kullanıcı kendi Instagram hesabına benzer içerik üreten hesapları bulmak istiyor: ilham almak için, kopyalamak için değil.",
    "Adımlar:",
    "1. Verilen gönderi açıklamalarından ve notlardan kullanıcının nişini (konu, format, ton, kitle) 1-2 cümleyle çıkar.",
    "2. web_search aracıyla AÇIK WEB'de bu nişteki içerik üreticilerini ara: 'en iyi ... içerik üreticileri' listeleri, haberler, röportajlar, bloglar. Aramaları nişin diline ve ülkesine göre yap; gerekirse İngilizce de ara.",
    "3. Yalnızca arama sonuçlarında GERÇEKTEN geçen hesapları aday yap. Her adayın kaynağı, onu gördüğün sonucun adresi olsun. Emin olmadığın kullanıcı adını uydurma; kullanıcı adı sonuçta açıkça yazmıyorsa adayı ekleme.",
    "4. Büyük ünlüler yerine kullanıcının ölçeğine yakın ve formatı benzer hesapları öne al; birkaç tane daha büyük 'hedef' hesap da olabilir.",
    "5. Kullanıcının kendisinin Instagram'da arayabileceği hashtag'ler ve arama ifadeleri öner.",
    "Kullanıcının kendi hesaplarını ve ilham panosunda zaten olan hesapları aday yapma.",
    `Dil: ${dilAdi}.`,
    "",
    "Son mesajında YALNIZCA şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
    '{"nis": "...", "hashtagler": ["etiket", "..."], "aramalar": ["...", "..."], "adaylar": [{"handle": "kullaniciadi", "ad": "Görünen ad", "platform": "instagram", "neden": "neden benzer, 1-2 cümle", "kaynak": "https://...", "kaynakBaslik": "sayfa başlığı"}]}',
    `hashtagler 6-12, aramalar 3-6, adaylar en fazla ${MAX_ADAY}.`,
  ].join("\n");
}

export function kesifIstemi(b: KesifBaglami): string {
  const s: string[] = ["Kullanıcının hesap(lar)ı:"];
  for (const h of b.hesaplar) {
    s.push(`- @${h.handle}${typeof h.takipci === "number" ? ` (${h.takipci} takipçi)` : ""}`);
    if (h.tonNotu) s.push(`  Ton notu: ${h.tonNotu}`);
    if (h.kitleNotu) s.push(`  Kitle notu: ${h.kitleNotu}`);
  }
  if (b.enIyiler.length) {
    s.push("", "En iyi giden gönderileri (tür · normalin katı · açıklama):");
    for (const g of b.enIyiler) {
      s.push(`- ${g.tur}${g.kat !== null ? ` · ${g.kat}x` : ""} · ${g.aciklama.replace(/\s+/g, " ").slice(0, 280)}`);
    }
  } else {
    s.push("", "Gönderi verisi yok; nişi notlardan ve ilhamlardan çıkar.");
  }
  if (b.ilhamlar.length) {
    s.push("", "İlham panosundaki kaynaklar (bunları aday yapma, tarzı anlatıyorlar):");
    for (const i of b.ilhamlar.slice(0, 20)) {
      s.push(`- ${i.title}${i.handle ? ` (@${i.handle})` : ""}${i.note ? `: ${i.note.replace(/\s+/g, " ").slice(0, 200)}` : ""}`);
    }
  }
  if (b.istek?.trim()) s.push("", `Kullanıcının isteği: ${b.istek.trim().slice(0, 400)}`);
  return s.join("\n");
}

/**
 * Yanıt bloklarından bu keşifte gerçekten görülen adresler: arama sonuçları
 * (`web_search_tool_result`) ve metin alıntıları (`citations`). Karşılaştırma
 * için normalleştirilir (sondaki "/", "www.", parça).
 */
export function gorulenAdresler(bloklar: unknown[]): Set<string> {
  const adresler = new Set<string>();
  const ekle = (url: unknown) => {
    const n = adresiNormallestir(url);
    if (n) adresler.add(n);
  };
  for (const b of bloklar as any[]) {
    if (b?.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const sonuc of b.content) ekle(sonuc?.url);
    }
    if (b?.type === "text" && Array.isArray(b.citations)) {
      for (const c of b.citations) ekle(c?.url);
    }
  }
  return adresler;
}

export function adresiNormallestir(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return null;
  }
}

export interface OkunanKesif {
  nis: string;
  hashtagler: string[];
  aramalar: string[];
  adaylar: SocialDiscoveryCandidate[];
}

/**
 * Yanıtı okur, adayları temizler ve doğrular.
 *
 * `haric`: kullanıcının kendi hesapları ve ilham panosundakiler — model
 * talimata rağmen onları önerebiliyor. Doğrulanmış adaylar önce gelir.
 */
export function kesfiCoz(yanit: string, gorulen: Set<string>, haric: Set<string>): OkunanKesif {
  const ham = jsonuAyikla(yanit) as Record<string, unknown> | null;
  if (!ham || typeof ham !== "object") throw new KesifOkunamadi("Lio bir sonuç üretemedi, tekrar dene."); // dil:anahtar

  const metin = (v: unknown, tavan: number) => (typeof v === "string" ? v.trim().slice(0, tavan) : "");
  const liste = (v: unknown, tavan: number, uzunluk: number) =>
    Array.from(
      new Set(
        (Array.isArray(v) ? v : [])
          .map((x) => metin(x, uzunluk))
          .filter(Boolean)
      )
    ).slice(0, tavan);

  const hashtagler = Array.from(
    new Set(
      liste(ham.hashtagler, 15, 60)
        .map((h) => h.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
        .filter((h) => h && !/^\d+$/.test(h))
    )
  ).slice(0, 12);

  const gorulenAdaylar = new Set<string>();
  const adaylar: SocialDiscoveryCandidate[] = [];
  for (const a of Array.isArray(ham.adaylar) ? (ham.adaylar as any[]) : []) {
    const handle = normalizeSocialHandle(metin(a?.handle, 120));
    if (!KULLANICI_ADI.test(handle) || haric.has(handle) || gorulenAdaylar.has(handle)) continue;
    gorulenAdaylar.add(handle);
    const platform = PLATFORMLAR.has(a?.platform) ? (a.platform as SocialPlatform) : "instagram";
    const kaynakNorm = adresiNormallestir(a?.kaynak);
    const dogrulandi = !!kaynakNorm && gorulen.has(kaynakNorm);
    adaylar.push({
      handle,
      ad: metin(a?.ad, 120) || undefined,
      platform,
      neden: metin(a?.neden, 500),
      // Doğrulanmamış kaynak GÖSTERİLMEZ: uydurma bir adres kullanıcıyı
      // "kaynağı var" diye yanıltırdı.
      kaynak: dogrulandi ? metin(a.kaynak, 600) : undefined,
      kaynakBaslik: dogrulandi ? metin(a?.kaynakBaslik, 200) || undefined : undefined,
      dogrulandi,
    });
  }
  adaylar.sort((x, y) => Number(y.dogrulandi) - Number(x.dogrulandi));

  const sonuc = {
    nis: metin(ham.nis, 600),
    hashtagler,
    aramalar: liste(ham.aramalar, 6, 120),
    adaylar: adaylar.slice(0, MAX_ADAY),
  };
  if (!sonuc.nis && sonuc.adaylar.length === 0 && sonuc.hashtagler.length === 0) {
    throw new KesifOkunamadi("Lio bir sonuç üretemedi, tekrar dene."); // dil:anahtar
  }
  return sonuc;
}

/**
 * Yanıtın JSON'u taşıyan metni: SON araç bloğundan sonraki metin blokları.
 *
 * Model aramalardan önce "şunu arıyorum" gibi ara metinler yazabiliyor; ayrıca
 * alıntı (citation) olan metin birden çok bloğa BÖLÜNÜYOR. Bloklar arasına
 * ayraç konmaz — JSON bir dizginin ortasından bölünmüş olabilir.
 */
export function sonMetin(bloklar: unknown[]): string {
  const liste = bloklar as any[];
  let bas = 0;
  for (let i = liste.length - 1; i >= 0; i--) {
    if (liste[i]?.type !== "text") {
      bas = i + 1;
      break;
    }
  }
  const sonra = liste.slice(bas).filter((b) => b?.type === "text");
  const secilen = sonra.length ? sonra : liste.filter((b) => b?.type === "text");
  return secilen.map((b) => b.text ?? "").join("");
}

