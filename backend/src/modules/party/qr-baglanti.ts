import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import type { OkunanKisi } from "./kartvizit-plani";
import { kartvizitMetniCoz, kartvizitMetniMi } from "./vcard";

/**
 * QR'daki BAĞLANTIDAN kartvizit: dijital kartvizit sayfaları (Projelio
 * kartviziti, HiHello, Popl, Linktree benzerleri).
 *
 * Sıra: bağlantı doğrudan vCard ise o → sayfada vCard ("Rehbere kaydet",
 * .vcf) bağlantısı varsa o → yoksa sayfanın metni Lio'ya verilir, Lio okur.
 * Çoğu dijital kartvizit hizmeti bir .vcf bağlantısı sunuyor; o yol hatasız.
 *
 * GÜVENLİK. Bağlantıyı yabancı birinin QR'ı veriyor ve sunucu onu AÇIYOR —
 * iç ağa (VPS'teki PostgREST, tailnet, bulut meta veri adresi) istek attırmanın
 * en kolay yolu. Bu yüzden: yalnızca http/https ve 80/443, ad çözülür ve
 * TÜM adresler herkese açık olmalı, yönlendirmeler elle izlenir (her adım
 * yeniden denetlenir, en çok 3), yanıt 1 MB'ta kesilir, 8 sn zaman aşımı.
 * Kalan risk (denetimle bağlantı arasında DNS'in değişmesi) kabul edildi:
 * dönen içerik yalnızca metin olarak modele gidiyor, kimseye geri sızmıyor.
 */

const ZAMAN_ASIMI_MS = 8_000;
const BAYT_TAVANI = 1024 * 1024;
const YONLENDIRME_TAVANI = 3;

/** İç ağ, döngü, bağlantı-yerel, CGNAT (tailnet 100.64/10), çok noktaya yayın, ayrılmış. */
export function ozelAdresMi(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const k = ip.toLowerCase();
    if (k === "::" || k === "::1") return true;
    const eslenik = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(k);
    if (eslenik) return ozelAdresMi(eslenik[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(k);
  }
  return true;
}

class GuvensizAdres extends Error {}

async function adresDenetle(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new GuvensizAdres("yalnızca http/https");
  if (url.port && url.port !== "80" && url.port !== "443") throw new GuvensizAdres("izin verilmeyen port");
  if (url.username || url.password) throw new GuvensizAdres("kimlik bilgili adres");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const adresler = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!adresler.length || adresler.some(ozelAdresMi)) throw new GuvensizAdres("iç ağ adresi");
}

async function guvenliGetir(adres: string): Promise<{ url: URL; tur: string; govde: string }> {
  let url = new URL(adres);
  for (let i = 0; i <= YONLENDIRME_TAVANI; i++) {
    await adresDenetle(url);
    const yanit = await fetchWithTimeout(
      url,
      { redirect: "manual", headers: { "User-Agent": "ProjelioBot/1.0 (+https://projelio.app)", Accept: "text/vcard, text/html;q=0.9, */*;q=0.5" } },
      ZAMAN_ASIMI_MS
    );
    if (yanit.status >= 300 && yanit.status < 400 && yanit.headers.get("location")) {
      url = new URL(yanit.headers.get("location")!, url);
      continue;
    }
    if (!yanit.ok || !yanit.body) throw new Error(`sayfa açılamadı (${yanit.status})`);
    const parcalar: Uint8Array[] = [];
    let toplam = 0;
    for await (const p of yanit.body as any as AsyncIterable<Uint8Array>) {
      toplam += p.length;
      if (toplam > BAYT_TAVANI) break;
      parcalar.push(p);
    }
    return { url, tur: yanit.headers.get("content-type") ?? "", govde: Buffer.concat(parcalar).toString("utf8") };
  }
  throw new Error("çok fazla yönlendirme");
}

/** Sayfadaki vCard bağlantısı ("Rehbere kaydet", .vcf, /vcard). */
export function vcfBaglantisiBul(html: string, taban: URL | string): string | null {
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (/\.vcf(\?|#|$)|\/vcard\b|[?&]format=vcf|download[-_]?contact|save[-_]?contact/i.test(href)) {
      try {
        return new URL(href, taban).toString();
      } catch {
        // Geçersiz adres: diğerine bak.
      }
    }
  }
  return null;
}

/** Sayfanın okunur metni: başlık, açıklama ve gövde (betik/stil atılır), en çok 3000 karakter. */
export function sayfaMetni(html: string): string {
  const meta = (ad: string) =>
    new RegExp(`<meta[^>]+(?:name|property)=["']${ad}["'][^>]*content=["']([^"']*)["']`, "i").exec(html)?.[1];
  const baslik = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  const govde = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|a|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return [baslik, meta("og:title"), meta("description") ?? meta("og:description"), govde]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000);
}

export interface QrBaglantiSonucu {
  kaynak: "vcard" | "sayfa-vcard" | "sayfa-metni" | "acilamadi";
  url: string;
  kisiler: OkunanKisi[];
  sayfaMetni?: string;
  hata?: string;
}

export async function kartvizitBaglantisiniCoz(adres: string): Promise<QrBaglantiSonucu> {
  try {
    const sayfa = await guvenliGetir(adres);
    if (/vcard/i.test(sayfa.tur) || kartvizitMetniMi(sayfa.govde)) {
      return { kaynak: "vcard", url: sayfa.url.toString(), kisiler: kartvizitMetniCoz(sayfa.govde) };
    }
    const vcf = vcfBaglantisiBul(sayfa.govde, sayfa.url);
    if (vcf) {
      const kart = await guvenliGetir(vcf).catch(() => null);
      const kisiler = kart && kartvizitMetniMi(kart.govde) ? kartvizitMetniCoz(kart.govde) : [];
      if (kisiler.length) return { kaynak: "sayfa-vcard", url: sayfa.url.toString(), kisiler };
    }
    return { kaynak: "sayfa-metni", url: sayfa.url.toString(), kisiler: [], sayfaMetni: sayfaMetni(sayfa.govde) };
  } catch (e) {
    const hata = e instanceof GuvensizAdres ? `güvenli olmayan adres (${e.message})` : e instanceof Error ? e.message : "açılamadı";
    return { kaynak: "acilamadi", url: adres, kisiler: [], hata };
  }
}
