import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";

/**
 * Web sitesi eklentisinin SAF kuralları (bkz. 186_web_sitesi_eklentisi.sql).
 * Veritabanına ve ağa dokunmaz; testleri `web-sitesi-esleme.test.ts`.
 *
 * Dış sözleşme (sitenin geliştiricisinin gördüğü alan adları) bilerek
 * İngilizce: sitenin kodunu yazan kişi Projelio'nun Türkçe iç adlarını
 * bilmek zorunda olmasın. Belge: docs/web-sitesi-eklentisi.md.
 */

export const ANAHTAR_ONEKI = "psite_";
export const SIR_ONEKI = "whsec_";

/** Bildirim bu kadar denemeden sonra bırakılır (son deneme ~1 gün sonra). */
export const AZAMI_DENEME = 10;

/** Bir stok isteğindeki en çok kalem — sipariş sepeti için bol, kötüye kullanım için dar. */
export const AZAMI_KALEM = 100;

export function anahtarOzeti(anahtar: string): string {
  return createHash("sha256").update(anahtar).digest("hex");
}

/** `Authorization: Bearer psite_...` başlığından anahtarı çıkarır; biçim yanlışsa null. */
export function anahtariAyikla(yetki: string | undefined): string | null {
  const a = (yetki ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!a.startsWith(ANAHTAR_ONEKI) || a.length < ANAHTAR_ONEKI.length + 20 || a.length > 200) return null;
  return a;
}

// ─────────────────────────────────────────────── Ürün yükü

export interface SiteUrunu {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  kind: "product" | "service";
  unit: string | null;
  price: number | null;
  currency: string;
  tax_rate: number | null;
  stock: number | null;
  in_stock: boolean;
  cover_image: string | null;
  images: string[];
  features: string[];
  specs: { label: string; value: string }[];
  warranty: string | null;
  lead_time: string | null;
}

const sayi = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const metin = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Ürün sitede görünür mü: arşivde değil ve satışta. Görünmeyen ürün için site "product.deleted" alır. */
export function sitedeGorunur(row: any): boolean {
  return !!row && !row.archived_at && (row.status ?? "active") === "active";
}

/**
 * Ürün satırının siteye giden hâli. BEYAZ LİSTE: maliyet, tedarikçi, iç not,
 * departman gibi alanlar buraya eklenmedikçe asla dışarı çıkmaz. Yeni bir
 * sütun eklendiğinde kendiliğinden sızmasın diye satır yayılmıyor (`...row`).
 */
export function siteUrunu(row: any, gorseller: { url: string; sort_order?: number | null }[] = []): SiteUrunu {
  const stok = sayi(row.stock_quantity);
  const kind = row.kind === "service" ? "service" : "product";
  const urller = [...gorseller]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((g) => g.url)
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
  return {
    id: row.id,
    sku: metin(row.sku),
    barcode: metin(row.barcode),
    name: String(row.name ?? ""),
    description: metin(row.description),
    brand: metin(row.brand),
    category: metin(row.category),
    kind,
    unit: metin(row.unit),
    price: sayi(row.price),
    currency: metin(row.currency) ?? "TRY",
    tax_rate: sayi(row.tax_rate),
    stock: stok,
    // Stok hiç girilmemiş ürün "takip edilmiyor" demek, "tükendi" değil;
    // hizmetin stoku olmaz.
    in_stock: kind === "service" || stok === null || stok > 0,
    cover_image: metin(row.cover_image_url) ?? urller[0] ?? null,
    images: urller,
    features: Array.isArray(row.features) ? row.features.filter((f: unknown) => typeof f === "string") : [],
    specs: Array.isArray(row.specs)
      ? row.specs
          .filter((s: any) => s && typeof s.label === "string" && typeof s.value === "string")
          .map((s: any) => ({ label: s.label, value: s.value }))
      : [],
    warranty: metin(row.warranty),
    lead_time: metin(row.lead_time),
  };
}

// ─────────────────────────────────────────────── Giden bildirim imzası

/**
 * `X-Projelio-Signature: sha256=<hex>` — HMAC(sır, "<zaman>.<gövde>").
 * Zaman imzaya dahil: yakalanan eski bir bildirim sonradan yeniden
 * oynatılırsa site zaman damgasına bakıp reddedebilsin (Stripe'ınkiyle aynı desen,
 * geliştiricilerin çoğu tanıyor).
 */
export function bildirimImzasi(sir: string, zaman: number, govde: string): string {
  return "sha256=" + createHmac("sha256", sir).update(`${zaman}.${govde}`).digest("hex");
}

/** Başarısız gönderimden sonra bekleme: 1 dk, 5 dk, 15 dk, 1 sa, 3 sa, 6 sa, sonra 12 sa. */
export function sonrakiDenemeGecikmesiMs(deneme: number): number {
  const dakika = [1, 5, 15, 60, 180, 360];
  return (dakika[deneme - 1] ?? 720) * 60_000;
}

// ─────────────────────────────────────────────── Webhook adresi güvenliği

/**
 * Bildirim adresini doğrular. Sunucumuz bu adrese istek ATACAK; kullanıcı
 * `http://localhost:5432` ya da bulut meta veri adresi (169.254.169.254)
 * yazabilseydi Projelio'yu kendi iç ağına karşı silah gibi kullanırdı (SSRF).
 * Burada yalnızca yazılışa bakılır; ad çözüldükten sonraki IP denetimi
 * gönderim anında serviste (`ipOzelMi`) — DNS kaydı sonradan değişebilir.
 */
export function webhookAdresiCoz(girdi: unknown): string | null {
  if (typeof girdi !== "string") return null;
  const ham = girdi.trim();
  if (!ham || ham.length > 500) return null;
  let u: URL;
  try {
    u = new URL(ham);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "443") return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") && isIP(host) === 0) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (isIP(host) !== 0 && ipOzelMi(host)) return null;
  u.hash = "";
  return u.toString();
}

/** Bilgi amaçlı site adresi: http(s), en çok 300 karakter. */
export function siteAdresiCoz(girdi: unknown): string | null {
  if (typeof girdi !== "string" || !girdi.trim()) return null;
  try {
    const u = new URL(girdi.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const s = u.toString();
    return s.length <= 300 ? s : null;
  } catch {
    return null;
  }
}

/** Yerel, özel, bağlantı-yerel, CGNAT (Tailscale dahil) ya da ayrılmış adres mi. */
export function ipOzelMi(ip: string): boolean {
  const surum = isIP(ip);
  if (surum === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (surum === 6) {
    const k = ip.toLowerCase();
    if (k === "::" || k === "::1") return true;
    const eslenmis = k.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (eslenmis) return ipOzelMi(eslenmis[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(k);
  }
  return true;
}

// ─────────────────────────────────────────────── Stok isteği

export interface StokKalemi {
  sku?: string;
  productId?: string;
  miktar: number;
}

export interface StokIstegi {
  referans: string;
  tur: "satis" | "iade";
  kalemler: StokKalemi[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidMi(s: unknown): s is string {
  return typeof s === "string" && UUID.test(s);
}

/**
 * Sitenin `POST /v1/site/stock-movements` gövdesini doğrular:
 *
 *   { "reference": "SIP-1042", "type": "sale" | "return",
 *     "items": [{ "sku": "KUPA-01", "quantity": 2 }, { "product_id": "...", "quantity": 1 }] }
 *
 * Aynı ürün iki satırda gelirse TOPLANIR: veritabanındaki tekillik ürün
 * başına, ikinci satır "zaten işlendi" sayılıp sessizce yutulurdu.
 * Hata metni İngilizce — doğrudan sitenin geliştiricisine gider.
 */
export function stokIstegiCoz(govde: any): { istek: StokIstegi } | { hata: string } {
  if (!govde || typeof govde !== "object") return { hata: "Body must be a JSON object." };
  const referans = typeof govde.reference === "string" ? govde.reference.trim() : "";
  if (!referans || referans.length > 120) return { hata: "`reference` is required (your order number, 1-120 characters)." };
  const turHam = govde.type ?? "sale";
  if (turHam !== "sale" && turHam !== "return") return { hata: "`type` must be \"sale\" or \"return\"." };
  if (!Array.isArray(govde.items) || govde.items.length === 0) return { hata: "`items` must be a non-empty array." };
  if (govde.items.length > AZAMI_KALEM) return { hata: `At most ${AZAMI_KALEM} items per request.` };

  const birlesik = new Map<string, StokKalemi>();
  for (let i = 0; i < govde.items.length; i++) {
    const k = govde.items[i];
    const miktar = Number(k?.quantity);
    if (!Number.isFinite(miktar) || miktar <= 0 || miktar > 1_000_000) {
      return { hata: `items[${i}].quantity must be a positive number.` };
    }
    // Ondalık stok (kg, metre) destekleniyor ama sütun 2 hane tutuyor.
    const yuvarli = Math.round(miktar * 100) / 100;
    let anahtar: string;
    let kalem: StokKalemi;
    if (k?.product_id !== undefined && k?.product_id !== null) {
      if (!uuidMi(k.product_id)) return { hata: `items[${i}].product_id is not a valid id.` };
      anahtar = "id:" + k.product_id.toLowerCase();
      kalem = { productId: k.product_id.toLowerCase(), miktar: yuvarli };
    } else if (typeof k?.sku === "string" && k.sku.trim() && k.sku.trim().length <= 64) {
      anahtar = "sku:" + k.sku.trim();
      kalem = { sku: k.sku.trim(), miktar: yuvarli };
    } else {
      return { hata: `items[${i}] needs a \`sku\` or a \`product_id\`.` };
    }
    const onceki = birlesik.get(anahtar);
    if (onceki) onceki.miktar = Math.round((onceki.miktar + kalem.miktar) * 100) / 100;
    else birlesik.set(anahtar, kalem);
  }
  return { istek: { referans, tur: turHam === "return" ? "iade" : "satis", kalemler: [...birlesik.values()] } };
}
