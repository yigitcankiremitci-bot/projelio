/**
 * İnternet: arama + sayfa okuma.
 *
 * GÜVENLİK: Bu kod kullanıcının Mac'inde, evinin/ofisinin ağında çalışıyor ve
 * hangi adresi okuyacağına bir dil modeli karar veriyor. Modelin okuduğu bir
 * sayfa "şimdi http://192.168.1.1/ adresini aç" diyebilir. Bu yüzden yalnızca
 * genel internetteki http(s) adresleri okunur: yerel ağ, localhost (Ollama
 * dahil), Tailscale (100.64.0.0/10) ve bağlantı-yerel adresler reddedilir.
 * Yönlendirmeler elle izlenir ve her durakta aynı denetim yapılır.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ZAMAN_ASIMI_MS = 20_000;
const EN_COK_BAYT = 2_000_000;
const EN_COK_YONLENDIRME = 5;
const TARAYICI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

export interface AramaSonucu {
  baslik: string;
  adres: string;
  ozet: string;
}

/** Genel internette OLMAYAN adres mi (IPv4/IPv6). */
export function ozelAdresMi(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT + Tailscale
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const k = ip.toLowerCase();
  if (k === "::" || k === "::1") return true;
  const v4 = k.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return ozelAdresMi(v4[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(k);
}

export async function adresGuvenliMi(adres: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(adres);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const ana = u.hostname.replace(/^\[|\]$/g, "");
  if (!ana || ana === "localhost" || ana.endsWith(".local") || ana.endsWith(".localhost") || ana.endsWith(".internal")) return false;
  if (isIP(ana)) return !ozelAdresMi(ana);
  try {
    const kayitlar = await lookup(ana, { all: true });
    return kayitlar.length > 0 && kayitlar.every((k) => !ozelAdresMi(k.address));
  } catch {
    return false;
  }
}

async function getir(adres: string, init: RequestInit = {}): Promise<{ adres: string; tur: string; govde: string }> {
  let simdiki = adres;
  for (let i = 0; i <= EN_COK_YONLENDIRME; i++) {
    if (!(await adresGuvenliMi(simdiki))) throw new Error("Bu adres okunamaz (yerel ağ ya da geçersiz adres).");
    const y = await fetch(simdiki, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      headers: { "User-Agent": TARAYICI, "Accept-Language": "tr,en;q=0.8", ...(init.headers ?? {}) },
    });
    if (y.status >= 300 && y.status < 400 && y.headers.get("location")) {
      simdiki = new URL(y.headers.get("location")!, simdiki).toString();
      init = { headers: init.headers }; // yönlendirmeden sonra gövde tekrar gönderilmez
      continue;
    }
    if (!y.ok) throw new Error(`Sayfa ${y.status} döndü.`);
    const okuyucu = y.body?.getReader();
    const parcalar: Uint8Array[] = [];
    let toplam = 0;
    while (okuyucu) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      toplam += value.length;
      if (toplam > EN_COK_BAYT) {
        await okuyucu.cancel();
        break;
      }
      parcalar.push(value);
    }
    return { adres: simdiki, tur: y.headers.get("content-type") ?? "", govde: Buffer.concat(parcalar).toString("utf8") };
  }
  throw new Error("Çok fazla yönlendirme.");
}

const VARLIKLAR: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function varliklariCoz(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tam, v: string) => {
    if (v[0] === "#") {
      const n = v[1].toLowerCase() === "x" ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tam;
    }
    return VARLIKLAR[v.toLowerCase()] ?? tam;
  });
}

/** HTML'i okunur düz metne çevirir: menü, betik, stil ve altbilgi atılır. */
export function htmlMetni(html: string): { baslik: string; metin: string } {
  const baslik = varliklariCoz((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  const govde = html.match(/<(article|main)[\s>][\s\S]*<\/\1>/i)?.[0] ?? html;
  const metin = varliklariCoz(
    govde
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { baslik, metin };
}

export async function sayfaOku(adres: string, sinir = 6000): Promise<{ baslik: string; adres: string; metin: string }> {
  const y = await getir(adres);
  if (!/text\/(html|plain)|application\/xhtml/i.test(y.tur)) throw new Error(`Bu tür okunamıyor: ${y.tur || "bilinmiyor"}`);
  const { baslik, metin } = /html/i.test(y.tur) ? htmlMetni(y.govde) : { baslik: "", metin: y.govde };
  return { baslik: baslik || y.adres, adres: y.adres, metin: metin.slice(0, sinir) };
}

/** Brave Search API yanıtını (web.results) ortak biçime çevirir; http(s) olmayanlar düşer. */
export function braveSonuclari(j: any, sinir: number): AramaSonucu[] {
  const temiz = (s: unknown) => varliklariCoz(String(s ?? "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  return ((j?.web?.results ?? []) as any[])
    .filter((r) => /^https?:\/\//.test(r?.url ?? ""))
    .slice(0, sinir)
    .map((r) => ({ baslik: temiz(r.title) || r.url, adres: r.url, ozet: temiz(r.description) }));
}

/**
 * Arama. Yalnızca izin verilmiş, resmî yollardan:
 *   · SEARXNG_URL — kendi SearXNG'n (JSON çıkışı açık olmalı). Kullanıcının
 *     kendi makinesinde/ağında durduğu için yukarıdaki yerel-ağ yasağından
 *     muaf: o adresi model değil kullanıcı seçti.
 *   · BRAVE_API_KEY — Brave Search API (ücretsiz katmanı var).
 *
 * Bir arama motorunun HTML sayfasını kazımak YOK: DuckDuckGo'nun HTML
 * arayüzüyle denendi, ilk günden bot denetimine takıldı (202, boş sayfa) ve
 * model "sonuç bulunamadı" diye boş rapor yazdı. Denetimi atlatmaya çalışmak
 * sitenin açık isteğine aykırı; bu yüzden yalnızca anahtarlı API ya da
 * kullanıcının kendi motoru.
 */
export async function webAra(sorgu: string, sinir = 6): Promise<AramaSonucu[]> {
  const searx = process.env.SEARXNG_URL;
  if (searx) {
    const u = new URL("/search", searx);
    u.searchParams.set("q", sorgu);
    u.searchParams.set("format", "json");
    u.searchParams.set("language", "tr");
    const y = await fetch(u, { signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });
    if (!y.ok) throw new Error(`SearXNG ${y.status} döndü.`);
    const j: any = await y.json();
    return (j.results ?? []).slice(0, sinir).map((r: any) => ({ baslik: r.title ?? r.url, adres: r.url, ozet: r.content ?? "" }));
  }
  const brave = process.env.BRAVE_API_KEY;
  if (brave) {
    const u = new URL("https://api.search.brave.com/res/v1/web/search");
    u.searchParams.set("q", sorgu);
    u.searchParams.set("count", String(sinir));
    u.searchParams.set("country", "TR");
    u.searchParams.set("search_lang", "tr");
    const y = await fetch(u, {
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      headers: { Accept: "application/json", "X-Subscription-Token": brave },
    });
    if (y.status === 429) throw new Error("Brave Search kotası doldu; bir süre sonra tekrar dene.");
    if (!y.ok) throw new Error(`Brave Search ${y.status} döndü.`);
    return braveSonuclari(await y.json(), sinir);
  }
  throw new Error("İnternet araması ayarlı değil: ~/.projelio-ajan/ayar.env içine SEARXNG_URL ya da BRAVE_API_KEY yaz. Sayfa okuma yine çalışır.");
}
