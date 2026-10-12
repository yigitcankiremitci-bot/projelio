import { createHmac, timingSafeEqual } from "node:crypto";
import type { MailAddress } from "@projelio/shared";
import { escapeHtml } from "./mail-format";

/**
 * @projelio.app kutularının saf kuralları: adres, webhook imzası, alıcı
 * eşleştirmesi, yanıt başlıkları. Veritabanı ve HTTP yok — mail-format.ts ile
 * aynı gerekçe, taklitsiz test edilebilsin diye.
 */

/** Kutuların alan adı. Test kopyasında başka bir alan adı verilebilsin diye ortamdan. */
export function postaAlanAdi(): string {
  return (process.env.PROJELIO_MAIL_DOMAIN?.trim() || "projelio.app").toLowerCase();
}

/**
 * Hiçbir kutuya verilmeyen yerel adlar.
 *
 * İki grup: (1) RFC 2142 ve sertifika makamlarının alan adı doğrularken
 * yazdığı adresler — postmaster@ ya da admin@ başkasının elinde olursa
 * projelio.app için SSL sertifikası alınabilir; (2) bizim gönderen
 * adreslerimiz (bildirim@, destek@, link@) — bir kutu onları alırsa kullanıcı
 * e-postalarımızın yanıtları o kutuya düşerdi.
 */
export const AYRILMIS_ADLAR = new Set([
  "abuse", "admin", "administrator", "hostmaster", "postmaster", "webmaster", "root",
  "security", "ssladmin", "ssl-admin", "mailer-daemon", "noreply", "no-reply",
  "bildirim", "destek", "link", "info", "support", "billing", "fatura",
]);

// dil:anahtar-baslangic
const ADRES_HATASI = {
  bos: "Adres boş olamaz.",
  bicim: "Adres yalnızca küçük harf, rakam, nokta, tire ve alt çizgi içerebilir; harf ya da rakamla başlayıp bitmeli.",
  uzun: "Adres en fazla 40 karakter olabilir.",
  ayrilmis: "Bu ad sistem için ayrılmış, başka bir ad seçin.",
};
// dil:anahtar-bitis

/**
 * Kullanıcının yazdığı yerel addan tam adres.
 *
 * Türkçe karakter KABUL EDİLMEZ, sessizce çevrilmez de: "satış" → "satis"
 * çevirisini kullanıcı görmeden yapmak, kartvizitine yanlış adres basmasına
 * yol açardı. Hata mesajı ne yazması gerektiğini söylüyor.
 */
export function adresiDogrula(yerelAd: string | undefined | null): { adres: string } | { hata: string } {
  // Kullanıcı tam adresi yapıştırmışsa alan adını biz ekleyeceğiz.
  const ham = (yerelAd ?? "").trim().toLowerCase().replace(new RegExp(`@${postaAlanAdi().replace(/\./g, "\\.")}$`), "");
  if (!ham) return { hata: ADRES_HATASI.bos };
  if (ham.length > 40) return { hata: ADRES_HATASI.uzun };
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(ham) || ham.includes("..")) return { hata: ADRES_HATASI.bicim };
  if (AYRILMIS_ADLAR.has(ham)) return { hata: ADRES_HATASI.ayrilmis };
  return { adres: `${ham}@${postaAlanAdi()}` };
}

// ============================================================ Webhook imzası

/**
 * Resend webhook'larını Svix imzalar. Kütüphane eklemeden elle doğruluyoruz
 * (yeni bağımlılık eklemiyoruz, bkz. CLAUDE.md):
 *
 *   imzalanan = `${svix-id}.${svix-timestamp}.${ham gövde}`
 *   anahtar   = base64 çözülmüş sır ("whsec_" öneki atılarak)
 *   imza      = base64(HMAC-SHA256) ; başlıkta "v1,<imza>" boşlukla ayrılmış liste
 *
 * Zaman damgası 5 dakikadan eskiyse reddedilir: yakalanmış bir isteğin
 * sonradan tekrar oynatılmasını (aynı postayı yeniden yazdırmayı) önler.
 */
export function svixImzasiGecerli(params: {
  govde: Buffer | string | undefined;
  id: string | undefined;
  zaman: string | undefined;
  imza: string | undefined;
  sir: string;
  simdi?: number;
}): boolean {
  const { govde, id, zaman, imza, sir } = params;
  if (!govde || !id || !zaman || !imza || !sir) return false;

  const saniye = Number(zaman);
  if (!Number.isFinite(saniye)) return false;
  const simdi = Math.floor((params.simdi ?? Date.now()) / 1000);
  if (Math.abs(simdi - saniye) > 5 * 60) return false;

  let anahtar: Buffer;
  try {
    anahtar = Buffer.from(sir.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (anahtar.length === 0) return false;

  const beklenen = createHmac("sha256", anahtar)
    .update(`${id}.${zaman}.`)
    .update(typeof govde === "string" ? Buffer.from(govde) : govde)
    .digest();

  return imza.split(" ").some((parca) => {
    const [surum, deger] = parca.split(",");
    if (surum !== "v1" || !deger) return false;
    const verilen = Buffer.from(deger, "base64");
    return verilen.length === beklenen.length && timingSafeEqual(verilen, beklenen);
  });
}

// ============================================================ Adresler

/** "Ad Soyad <ad@alan.com>" ya da yalın adres → { name, address }. */
export function adresAyristir(ham: string | undefined | null): MailAddress | undefined {
  const metin = (ham ?? "").trim();
  if (!metin) return undefined;
  const acili = metin.match(/^(.*)<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (acili) {
    const ad = acili[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { name: ad || undefined, address: acili[2].trim() };
  }
  return /^[^\s@]+@[^\s@]+$/.test(metin) ? { address: metin } : undefined;
}

export function adresListesi(hamlar: unknown): MailAddress[] {
  if (!Array.isArray(hamlar)) return [];
  return hamlar
    .map((h) => adresAyristir(typeof h === "string" ? h : undefined))
    .filter((a): a is MailAddress => Boolean(a));
}

/** Formdan gelen "a@b.com, c@d.com; e@f.com" → doğrulanmış adres listesi. */
export function aliciMetniniAyristir(metin: string | string[] | undefined | null): { adresler: string[]; gecersiz: string[] } {
  const parcalar = (Array.isArray(metin) ? metin : [metin ?? ""])
    .flatMap((m) => String(m).split(/[,;\n]+/))
    .map((p) => p.trim())
    .filter(Boolean);
  const adresler: string[] = [];
  const gecersiz: string[] = [];
  for (const parca of parcalar) {
    const a = adresAyristir(parca);
    if (a) {
      if (!adresler.includes(a.address.toLowerCase())) adresler.push(a.address.toLowerCase());
    } else gecersiz.push(parca);
  }
  return { adresler, gecersiz };
}

/**
 * Gelen postanın hangi @projelio.app kutularına ait olduğu.
 *
 * Google yönlendirmesinden geçen postada ZARF alıcısı Resend'in adresidir;
 * asıl alıcı To/Cc başlıklarında kalır. Gizli kopya (Bcc) alıcısı hiçbir
 * başlıkta görünmez — onu yalnızca Google'ın eklediği teslim başlıkları
 * söyleyebilir, o yüzden onlara da bakılıyor.
 */
export function postaAlicilari(email: {
  to?: unknown;
  cc?: unknown;
  received_for?: unknown;
  headers?: Record<string, unknown> | null;
}): string[] {
  const alan = `@${postaAlanAdi()}`;
  const ham: string[] = [];
  const ekle = (deger: unknown) => {
    if (Array.isArray(deger)) deger.forEach(ekle);
    else if (typeof deger === "string") deger.split(",").forEach((p) => ham.push(p));
  };
  ekle(email.to);
  ekle(email.cc);
  ekle(email.received_for);
  const basliklar = email.headers ?? {};
  for (const [ad, deger] of Object.entries(basliklar)) {
    if (["delivered-to", "x-original-to", "x-forwarded-to", "x-gm-original-to", "envelope-to"].includes(ad.toLowerCase())) {
      ekle(deger);
    }
  }
  const sonuc = new Set<string>();
  for (const parca of ham) {
    const a = adresAyristir(parca)?.address.toLowerCase();
    if (a && a.endsWith(alan)) sonuc.add(a);
  }
  return [...sonuc];
}

/** DMARC'ı açıkça düşen posta spam'e gider; sonuç yoksa (eski sunucular) gelen kutusuna. */
export function gelenKlasoru(auth: { dmarc?: string } | null | undefined): "inbox" | "spam" {
  return auth?.dmarc === "fail" ? "spam" : "inbox";
}

// ============================================================ Yanıt

/** "Re: " bir kez eklenir; "RE:", "Ynt:", "Fwd:" gibi önekler üst üste binmesin. */
export function yanitKonusu(konu: string, mod: "reply" | "replyAll" | "forward"): string {
  const sade = konu.replace(/^\s*((re|ynt|fw|fwd|ilt)\s*:\s*)+/i, "").trim() || "(konu yok)";
  return `${mod === "forward" ? "Fwd" : "Re"}: ${sade}`;
}

/** References = önceki zincir + yanıtlanan iletinin kimliği. */
export function referanslar(onceki: string | null | undefined, mesajKimligi: string | null | undefined): string | undefined {
  const parcalar = [...(onceki ?? "").split(/\s+/), mesajKimligi ?? ""].map((p) => p.trim()).filter(Boolean);
  const tekil = [...new Set(parcalar)];
  // Çok uzun zincirlerde başlık sınırını aşmamak için baştaki + son 10.
  const kisalt = tekil.length > 11 ? [tekil[0], ...tekil.slice(-10)] : tekil;
  return kisalt.length ? kisalt.join(" ") : undefined;
}

/**
 * Yanıtın altına alıntı. Outlook'ta Graph bunu kendisi yapıyordu; burada
 * sunucu biziz. Orijinal HTML olduğu gibi alıntılanır — karşı tarafın kendi
 * postası, onu kaçırmak biçimini bozardı.
 */
export function alintiEkle(params: {
  govdeHtml: string;
  tarih: string;
  gonderen: string;
  orijinalHtml?: string | null;
  orijinalMetin: string;
}): string {
  const ust = escapeHtml(`${params.tarih} tarihinde ${params.gonderen} şunu yazdı:`);
  const icerik = params.orijinalHtml?.trim()
    ? params.orijinalHtml
    : escapeHtml(params.orijinalMetin).replace(/\n/g, "<br>");
  return (
    `${params.govdeHtml}<br><div>${ust}</div>` +
    `<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${icerik}</blockquote>`
  );
}

/** Kovadaki yol: dosya adında yol ayırıcı ya da garip karakter olmasın. */
export function ekYolu(kutuId: string, iletiId: string, ekId: string, dosyaAdi: string): string {
  const temiz =
    dosyaAdi
      .normalize("NFKD")
      .replace(/[^\w.-]+|\.{2,}/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._]+/, "")
      .slice(-80) || "ek";
  return `${kutuId}/${iletiId}/${ekId}-${temiz}`;
}
