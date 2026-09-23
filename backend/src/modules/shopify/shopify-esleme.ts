import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shopify ↔ Projelio dönüşümlerinin saf (yan etkisiz) hâli.
 *
 * İmza doğrulama, mağaza adı denetimi ve siparişin sipariş/tahsilat alanlarına
 * çevrilmesi burada; veritabanı ve ağ ShopifyService'te. Böylece Shopify'ın
 * gerçek bir webhook gövdesiyle, Supabase taklit etmeden test edilebiliyor.
 */

/**
 * Shopify API sürümü. Çeyrekte bir yenisi çıkıyor ve her sürüm yaklaşık bir
 * yıl destekleniyor; süresi geçen sürüme yapılan çağrı en eski desteklenen
 * sürüme düşer ve gövde biçimi sessizce değişebilir. Tek yerde tutuluyor.
 */
export const SHOPIFY_API_VERSION = "2026-07";

/**
 * İstenen izinler. En az izin: Faz 1 yalnızca siparişi okuyor. Ürünler
 * Faz 2'de gelecek ama izni ŞİMDİ istiyoruz — izin listesi büyüdüğünde her
 * mağaza sahibi uygulamayı yeniden onaylamak zorunda kalıyor.
 *
 * Müşterinin adı/e-postası `read_orders` ile sipariş gövdesinde geliyor ama
 * Shopify'ın "korumalı müşteri verisi" onayı olmadan BOŞ gelir; o zaman
 * sipariş mağazanın misafir kartına yazılır (bkz. musteriKimligi).
 */
export const SHOPIFY_SCOPES = ["read_orders", "read_products"];

/** Webhook ile dinlenen konular (GraphQL enum adları). */
export const SHOPIFY_WEBHOOK_KONULARI = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_PAID", "APP_UNINSTALLED"];

/**
 * Kullanıcının yazdığı mağaza adını "ad.myshopify.com" biçimine getirir.
 *
 * Kabul edilenler: "magazam", "magazam.myshopify.com", "https://magazam.myshopify.com/admin".
 * Özel alan adı (magazam.com) KABUL EDİLMEZ: OAuth yalnızca myshopify
 * adresinde çalışır, ayrıca bu adres doğrulanmadan kullanılsaydı yetki isteği
 * herhangi bir sunucuya yönlendirilebilirdi.
 */
export function magazaAdresiCoz(girdi: unknown): string | null {
  if (typeof girdi !== "string") return null;
  let s = girdi.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  if (!s) return null;
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(s) ? s : null;
}

function sabitZamanliEsit(a: Buffer, b: Buffer): boolean {
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook imzası: ham gövdenin HMAC-SHA256 özeti, base64, `X-Shopify-Hmac-Sha256`.
 *
 * Ham gövde şart (main.ts rawBody): ayrıştırılıp yeniden yazılan JSON bayt
 * bayt aynı olmayabilir. Karşılaştırma sabit zamanlı.
 */
export function webhookImzasiGecerli(rawBody: Buffer | string | undefined, imza: string | undefined, sir: string): boolean {
  if (!rawBody || !imza || !sir) return false;
  const beklenen = createHmac("sha256", sir).update(rawBody).digest();
  let verilen: Buffer;
  try {
    verilen = Buffer.from(imza.trim(), "base64");
  } catch {
    return false;
  }
  return sabitZamanliEsit(verilen, beklenen);
}

/**
 * OAuth geri dönüşündeki sorgu imzası: `hmac` dışındaki parametreler ada göre
 * sıralanıp "a=1&b=2" biçiminde birleştirilir, HMAC-SHA256, hex.
 *
 * `state`imiz zaten imzalı ama bu kontrol ayrıca şart: `shop` ve `code`un
 * gerçekten Shopify'dan geldiğini kanıtlayan tek şey bu imza.
 */
export function sorguImzasiGecerli(sorgu: Record<string, unknown>, sir: string): boolean {
  const hmac = typeof sorgu.hmac === "string" ? sorgu.hmac : "";
  if (!hmac || !sir) return false;
  const mesaj = Object.keys(sorgu)
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort()
    .map((k) => {
      const v = sorgu[k];
      return `${k}=${Array.isArray(v) ? v.join(",") : String(v ?? "")}`;
    })
    .join("&");
  const beklenen = createHmac("sha256", sir).update(mesaj).digest();
  let verilen: Buffer;
  try {
    verilen = Buffer.from(hmac, "hex");
  } catch {
    return false;
  }
  return sabitZamanliEsit(verilen, beklenen);
}

// ============================================================ Sipariş

/** Webhook gövdesinden kullandığımız alanlar (REST sipariş biçimi). */
export interface ShopifySiparisi {
  id: number | string;
  name?: string;
  email?: string | null;
  created_at?: string;
  processed_at?: string | null;
  updated_at?: string | null;
  currency?: string;
  total_price?: string | number;
  total_outstanding?: string | number | null;
  financial_status?: string | null;
  cancelled_at?: string | null;
  test?: boolean;
  payment_gateway_names?: string[];
  line_items?: Array<{ title?: string; name?: string; quantity?: number }>;
  customer?: {
    id?: number | string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
  } | null;
  billing_address?: {
    name?: string | null;
    company?: string | null;
    phone?: string | null;
    address1?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
}

export type ShopifyOdemeYontemi = "nakit" | "havale" | "kredi_karti" | "diger";

/**
 * Ödeme ağ geçidi adı → bizim ödeme yöntemimiz.
 *
 * Shopify ağ geçidi adlarını serbest metin olarak veriyor ("Cash on Delivery
 * (COD)", "Bank Deposit", "shopify_payments", Türkiye'de "iyzico" …). Tanınan
 * elle ödeme yöntemleri dışındaki her şey kartla ödenmiş sayılır: çevrimiçi
 * mağazada varsayılan budur.
 */
export function odemeYontemiCoz(agGecitleri: string[] | undefined): ShopifyOdemeYontemi {
  const adlar = (agGecitleri ?? []).map((a) => a.toLowerCase());
  if (adlar.length === 0) return "kredi_karti";
  if (adlar.some((a) => a.includes("cash on delivery") || /\bcod\b/.test(a) || a.includes("kapıda") || a.includes("kapida"))) {
    return "nakit";
  }
  if (adlar.some((a) => a.includes("bank") || a.includes("havale") || a.includes("eft"))) return "havale";
  if (adlar.every((a) => a === "manual")) return "diger";
  return "kredi_karti";
}

function sayi(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Kuruş yuvarlaması: 0.1 + 0.2 gibi kayan nokta artıkları "kalan" hesabını bozmasın. */
function kurus(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Shopify tarih damgası mağazanın kendi saat dilimiyle geliyor
 * ("2026-09-24T01:30:00+03:00"). İlk 10 karakter mağazanın yerel günü —
 * UTC'ye çevirseydik gece yarısından hemen sonraki sipariş bir önceki güne
 * yazılırdı.
 */
export function yerelGun(damga: string | null | undefined): string | null {
  const s = typeof damga === "string" ? damga.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export interface SiparisAlanlari {
  siparis_no: string | null;
  aciklama: string | null;
  miktar: number | null;
  birim: string | null;
  tutar: number;
  para_birimi: string;
  siparis_tarihi: string;
  vade_gun: number;
  odeme_yontemi: ShopifyOdemeYontemi;
}

/**
 * Siparişi musteri_siparisleri sütunlarına çevirir. Yazılmayacaksa null ve
 * nedeni döner — "atlandı" olarak kayda geçer, sessiz değil.
 *
 * ATLANANLAR:
 *   · test siparişi — mağaza sahibinin ödeme denemesi kasaya gelir yazmasın;
 *   · tutarı sıfır olan — tablo tutar > 0 şartı koyuyor, ayrıca tahsil
 *     edilecek bir şey yok;
 *   · iptal edilmiş ve henüz hiç kaydı yok — iptal edilmiş siparişi YENİ
 *     açmak anlamsız. Kaydı olan siparişin iptali Faz 2'de (iadelerle birlikte).
 *
 * Tutar `total_price`: siparişin ilk tutarı. İade sonrası düşen
 * `current_total_price` değil — tahsil edilen tutarın altına inebilir ve
 * siparis servisinin "tutar tahsilattan az olamaz" kuralına takılırdı.
 */
export function siparisAlanlari(o: ShopifySiparisi, bugun: string): { alanlar: SiparisAlanlari } | { atla: string } {
  if (o.test) return { atla: "Test siparişi" };
  const tutar = kurus(sayi(o.total_price));
  if (tutar <= 0) return { atla: "Tutarı sıfır" };
  const para = String(o.currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(para)) return { atla: "Para birimi okunamadı" };

  const kalemler = (o.line_items ?? []).filter((k) => (k.quantity ?? 0) > 0);
  const miktar = kalemler.reduce((t, k) => t + (k.quantity ?? 0), 0);
  let aciklama = kalemler.map((k) => `${k.quantity}× ${k.title || k.name || "Ürün"}`).join(", ");
  if (aciklama.length > 250) aciklama = `${aciklama.slice(0, 247)}…`;

  return {
    alanlar: {
      siparis_no: o.name?.trim() || String(o.id),
      aciklama: aciklama || null,
      miktar: miktar > 0 ? miktar : null,
      birim: miktar > 0 ? "adet" : null,
      tutar,
      para_birimi: para,
      siparis_tarihi: yerelGun(o.created_at) ?? bugun,
      // Çevrimiçi satışta vade yok: ödeme sipariş anında alınır ya da (kapıda
      // ödeme, havale) teslimle gelir. Vadesi bugün olan alacak doğru okunur.
      vade_gun: 0,
      odeme_yontemi: odemeYontemiCoz(o.payment_gateway_names),
    },
  };
}

/**
 * Shopify'a göre bu siparişte şimdiye kadar tahsil edilen tutar.
 *
 * `total_outstanding` = müşterinin hâlâ ödemesi gereken. Tahsil edilen =
 * tutar − kalan. Alan yoksa (eski biçim) financial_status'a bakılır:
 * "paid" tamamı, diğerleri sıfır.
 *
 * İade edilen para burada DÜŞÜLMEZ (Faz 2): tahsil edilen hiçbir zaman
 * azalmaz, yani bir güncelleme kasadan satır silmez.
 */
export function shopifyTahsilEdilen(o: ShopifySiparisi, tutar: number): number {
  const durum = (o.financial_status ?? "").toLowerCase();
  if (durum === "voided" || durum === "pending" || durum === "authorized") return 0;
  if (o.total_outstanding !== undefined && o.total_outstanding !== null && String(o.total_outstanding).trim() !== "") {
    return Math.max(0, Math.min(tutar, kurus(tutar - sayi(o.total_outstanding))));
  }
  return durum === "paid" || durum === "partially_refunded" || durum === "refunded" ? tutar : 0;
}

/**
 * Yeni yazılacak tahsilat tutarı: Shopify'ın söylediği ile bizde kayıtlı
 * olanın farkı. Sıfır ya da eksiyse yazılacak bir şey yok.
 */
export function eksikTahsilat(shopifyToplam: number, kayitliToplam: number): number {
  const fark = kurus(shopifyToplam - kayitliToplam);
  return fark > 0 ? fark : 0;
}

// ============================================================ Müşteri

export interface MusteriKimligi {
  /** Shopify müşteri id'si — varsa kartı bununla buluruz. */
  shopifyId: string | null;
  email: string | null;
  ad: string | null;
  telefon: string | null;
  adres: { line?: string; city?: string; country?: string } | null;
  tur: "person" | "company";
}

/**
 * Siparişten müşteri kimliği.
 *
 * Ad ve e-posta Shopify'ın korumalı müşteri verisi onayına bağlı; onay yoksa
 * hepsi boş gelir. O zaman `ad` null döner ve sipariş mağazanın misafir
 * kartına yazılır — sipariş kaybolmaz, yalnızca kimin olduğu bilinmez.
 */
export function musteriKimligi(o: ShopifySiparisi): MusteriKimligi {
  const c = o.customer ?? null;
  const b = o.billing_address ?? null;
  const email = (c?.email || o.email || "").trim() || null;
  const kisiAdi = [c?.first_name, c?.last_name].filter((s) => s && s.trim()).join(" ").trim() || b?.name?.trim() || "";
  const sirket = b?.company?.trim() || "";
  const ad = sirket || kisiAdi || email;
  const adresAlanlari = {
    line: b?.address1?.trim() || undefined,
    city: b?.city?.trim() || undefined,
    country: b?.country?.trim() || undefined,
  };
  const adres = adresAlanlari.line || adresAlanlari.city || adresAlanlari.country ? adresAlanlari : null;
  return {
    shopifyId: c?.id !== undefined && c?.id !== null ? String(c.id) : null,
    email,
    ad: ad || null,
    telefon: (c?.phone || b?.phone || "").trim() || null,
    adres,
    tur: sirket ? "company" : "person",
  };
}
