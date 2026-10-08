/**
 * Dijital kartvizit (bkz. migration 151, backend modules/kartvizit).
 *
 * Her kullanıcı ücretsiz olarak `<adres>.projelio.app` adresinde açılan bir
 * kartvizit sayfası ve onu açan logolu bir QR kodu oluşturabilir. Sayfa
 * Projelio hesabı olmayan herkese açıktır: QR'ı okutan kişi arar, e-posta atar,
 * kişiyi tek dokunuşla rehberine ekler.
 *
 * NEDEN SHARED: adres önerileri ve doğrulama formda anında çalışıyor, sunucu da
 * aynı kuralla doğruluyor (iki kopya olsaydı form "uygun" deyip sunucu
 * reddederdi). QR tasarımı da tek yerde: Projelio'daki önizleme, indirilen
 * dosya ve kartvizit sayfasındaki "QR göster" aynı çizimi kullanıyor.
 */

import * as qrcodeModulu from "qrcode-generator";
import { PROJELIO_LOGO_PNG_DATA_URI } from "./kartvizitLogo";

// qrcode-generator CommonJS "export =" modülü. Backend esModuleInterop'suz
// derleniyor (default import orada derlenmiyor), web ise ESM'de default'u
// görüyor. İkisinde de çalışan yol: namespace import + varsa default.
type QrFabrikasi = (
  tip: 0,
  duzeltme: "L" | "M" | "Q" | "H"
) => { addData(veri: string): void; make(): void; getModuleCount(): number; isDark(satir: number, sutun: number): boolean };
const qrcode: QrFabrikasi =
  (qrcodeModulu as unknown as { default?: QrFabrikasi }).default ?? (qrcodeModulu as unknown as QrFabrikasi);

export const KARTVIZIT_ALAN_ADI = "projelio.app";

export function kartvizitAdresi(adres: string): string {
  return `https://${adres}.${KARTVIZIT_ALAN_ADI}`;
}

// ---------------------------------------------------------------- Sosyal

export type KartvizitSosyalAnahtar =
  | "instagram"
  | "linkedin"
  | "x"
  | "youtube"
  | "tiktok"
  | "threads"
  | "facebook"
  | "github"
  | "behance";

interface SosyalTanim {
  anahtar: KartvizitSosyalAnahtar;
  ad: string;
  /** Kabul edilen alan adları (www'suz). Tam adres yapıştırılırsa yol buradan okunur. */
  alanlar: string[];
  /** Tutamaçtan profil adresi. */
  adres: (tutamac: string) => string;
  /** Sayfada görünen kısa hali. */
  gorunen: (tutamac: string) => string;
  /** Tutamacın izin verilen karakterleri ve uzunluğu. */
  desen: RegExp;
  ornek: string;
}

const atli = (t: string) => `@${t}`;

/**
 * Sıra, sayfadaki sıradır. Tutamaç saklanır, adres değil: kullanıcı ister
 * "@ad" ister tam adres yazsın, kayıtta tek biçim olur ve adres her zaman
 * bizim ürettiğimiz güvenli adrestir (kullanıcının yazdığı bir URL hiçbir
 * zaman href'e olduğu gibi girmez).
 */
export const KARTVIZIT_SOSYAL: SosyalTanim[] = [
  { anahtar: "instagram", ad: "Instagram", alanlar: ["instagram.com"], adres: (t) => `https://www.instagram.com/${t}`, gorunen: atli, desen: /^[A-Za-z0-9._]{1,30}$/, ornek: "kullaniciadi" },
  {
    anahtar: "linkedin",
    ad: "LinkedIn",
    alanlar: ["linkedin.com", "tr.linkedin.com"],
    // LinkedIn'de kişi (in/) ve şirket (company/) sayfaları var; tutamaç yolu
    // önekiyle birlikte saklanıyor. Önek yoksa kişi sayfası varsayılır.
    adres: (t) => `https://www.linkedin.com/${t.includes("/") ? t : `in/${t}`}`,
    gorunen: (t) => (t.includes("/") ? t : `in/${t}`).replace(/-[0-9a-f]{6,}$/i, ""),
    desen: /^((in|company)\/)?[A-Za-z0-9\-_%]{2,100}$/,
    ornek: "in/ad-soyad",
  },
  { anahtar: "x", ad: "X", alanlar: ["x.com", "twitter.com"], adres: (t) => `https://x.com/${t}`, gorunen: atli, desen: /^[A-Za-z0-9_]{1,15}$/, ornek: "kullaniciadi" },
  { anahtar: "youtube", ad: "YouTube", alanlar: ["youtube.com", "m.youtube.com"], adres: (t) => `https://www.youtube.com/@${t}`, gorunen: atli, desen: /^[A-Za-z0-9._-]{3,30}$/, ornek: "kanaladi" },
  { anahtar: "tiktok", ad: "TikTok", alanlar: ["tiktok.com"], adres: (t) => `https://www.tiktok.com/@${t}`, gorunen: atli, desen: /^[A-Za-z0-9._]{2,24}$/, ornek: "kullaniciadi" },
  { anahtar: "threads", ad: "Threads", alanlar: ["threads.com", "threads.net"], adres: (t) => `https://www.threads.com/@${t}`, gorunen: atli, desen: /^[A-Za-z0-9._]{1,30}$/, ornek: "kullaniciadi" },
  { anahtar: "facebook", ad: "Facebook", alanlar: ["facebook.com", "m.facebook.com"], adres: (t) => `https://www.facebook.com/${t}`, gorunen: (t) => t, desen: /^[A-Za-z0-9.]{3,50}$/, ornek: "kullaniciadi" },
  { anahtar: "github", ad: "GitHub", alanlar: ["github.com"], adres: (t) => `https://github.com/${t}`, gorunen: (t) => t, desen: /^[A-Za-z0-9-]{1,39}$/, ornek: "kullaniciadi" },
  { anahtar: "behance", ad: "Behance", alanlar: ["behance.net"], adres: (t) => `https://www.behance.net/${t}`, gorunen: (t) => t, desen: /^[A-Za-z0-9_-]{2,40}$/, ornek: "kullaniciadi" },
];

export type KartvizitSosyal = Partial<Record<KartvizitSosyalAnahtar, string>>;

export function kartvizitSosyalTanimi(anahtar: KartvizitSosyalAnahtar): SosyalTanim {
  const t = KARTVIZIT_SOSYAL.find((s) => s.anahtar === anahtar);
  if (!t) throw new Error(`Bilinmeyen sosyal hesap: ${anahtar}`);
  return t;
}

/**
 * Kullanıcının yazdığını ("@ad", "ad", "instagram.com/ad", tam adres)
 * saklanacak tutamaca çevirir. Boş girdi → "" (alan temizlendi).
 * Tanınmayan biçim → null (form hata gösterir, sunucu reddeder).
 */
export function kartvizitSosyalNormallestir(anahtar: KartvizitSosyalAnahtar, girdi: string): string | null {
  const tanim = kartvizitSosyalTanimi(anahtar);
  let s = girdi.trim();
  if (!s) return "";

  const adresGibi = /^(https?:\/\/)?([a-z0-9-]+\.)*[a-z0-9-]+\.[a-z]{2,}\//i.test(s) || /^https?:\/\//i.test(s);
  if (adresGibi) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!tanim.alanlar.includes(host)) return null;
    const parcalar = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
    if (anahtar === "linkedin") {
      if (parcalar.length >= 2 && (parcalar[0] === "in" || parcalar[0] === "company")) s = `${parcalar[0]}/${parcalar[1]}`;
      else return null;
    } else {
      if (!parcalar.length) return null;
      s = parcalar[0];
    }
  }

  s = s.replace(/^@/, "");
  if (anahtar === "linkedin") s = s.replace(/^in\//, "");
  return tanim.desen.test(s) ? s : null;
}

// ---------------------------------------------------------------- Kayıt

/** Kullanıcının düzenlediği alanlar (formdan sunucuya). */
export interface KartvizitGirdisi {
  adres: string;
  fullName: string;
  title?: string;
  /** İngilizce görünümdeki unvan; boşsa Türkçesi kullanılır. */
  titleEn?: string;
  phone?: string;
  email?: string;
  website?: string;
  location?: string;
  /** Adın altındaki kısa söz (opsiyonel). */
  tagline?: string;
  taglineEn?: string;
  sosyal: KartvizitSosyal;
  /** Projelio profil fotoğrafı kartta ve rehber kaydında görünsün mü. */
  showPhoto: boolean;
  active: boolean;
}

/** Sunucunun döndürdüğü kayıt. Fotoğraf her zaman Projelio profilinden gelir. */
export interface Kartvizit extends KartvizitGirdisi {
  avatarUrl: string | null;
  updatedAt: string;
}

export const KARTVIZIT_SINIRLAR = {
  fullName: 80,
  title: 80,
  phone: 24,
  email: 120,
  website: 200,
  location: 60,
  tagline: 120,
} as const;

// ---------------------------------------------------------------- Adres

/**
 * Kimsenin alamayacağı adresler: Projelio'nun kendi alt alan adları, ileride
 * gerekebilecek genel adlar ve elle kurulmuş eski kartvizitler (firdevs,
 * selin — ayrı Caddy bloğunda duruyorlar ve joker bloktan önce eşleşiyorlar;
 * biri bu adı alsaydı kartı hiç açılmazdı).
 */
export const KARTVIZIT_AYRILMIS = new Set([
  "www", "app", "api", "brand", "mail", "webmail", "smtp", "imap", "pop", "ftp", "ns1", "ns2",
  "admin", "yonetim", "root", "destek", "help", "support", "docs", "blog", "status", "cdn",
  "static", "assets", "img", "media", "dev", "test", "staging", "beta", "demo", "preview",
  "kart", "kartvizit", "qr", "projelio", "lio", "autodiscover", "autoconfig", "m", "mobil",
  "giris", "login", "kayit", "signup", "odeme", "pay", "fatura", "hesap", "account",
  "firdevs", "selin",
]);

export type KartvizitAdresHatasi = "kisa" | "uzun" | "karakter" | "tire" | "ayrilmis";

export const KARTVIZIT_ADRES_EN_AZ = 3;
export const KARTVIZIT_ADRES_EN_COK = 30;

export function kartvizitAdresHatasi(adres: string): KartvizitAdresHatasi | null {
  if (adres.length < KARTVIZIT_ADRES_EN_AZ) return "kisa";
  if (adres.length > KARTVIZIT_ADRES_EN_COK) return "uzun";
  if (!/^[a-z0-9-]+$/.test(adres)) return "karakter";
  // Baştaki/sondaki tire DNS'te geçersiz; "--" ise IDN (xn--) önekine benziyor.
  if (adres.startsWith("-") || adres.endsWith("-") || adres.includes("--")) return "tire";
  if (KARTVIZIT_AYRILMIS.has(adres)) return "ayrilmis";
  return null;
}

/** Türkçe harfleri sadeleştirir, küçültür; harf/rakam dışını boşluğa çevirir. */
export function kartvizitSadelestir(metin: string): string {
  const harita: Record<string, string> = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
  return metin
    .toLocaleLowerCase("tr")
    .replace(/i̇/g, "i")
    .replace(/[çğıöşüâîû]/g, (h) => harita[h] ?? h)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Unvandan çıkan meslek etiketi: "Dr. Öğr. Üyesi" → dr, "Grafik Tasarımcı" →
 * tasarim. Önerileri rastgele sonek yerine kişinin kendisini anlatan bir
 * kelimeyle zenginleştiriyor (selin-dr, ali-tasarim).
 */
const MESLEK_ETIKETLERI: [RegExp, string][] = [
  [/\b(dr|doktor|hekim|prof|docent|doc)\b/, "dr"],
  [/\bav(ukat)?\b|\bhukuk/, "av"],
  [/tasarim|design/, "tasarim"],
  [/muzik|music|produkt?or|producer/, "muzik"],
  [/mimar|architect/, "mimar"],
  [/muhendis|engineer/, "muh"],
  [/yazilim|developer|gelistirici|software/, "dev"],
  [/pazarlama|marketing/, "pazarlama"],
  [/fotograf|photo/, "foto"],
  [/egitmen|ogretmen|teacher|coach|koc/, "egitim"],
  [/danisman|consult/, "danisman"],
];

export function kartvizitMeslekEtiketi(unvan: string | null | undefined): string | null {
  if (!unvan) return null;
  const s = kartvizitSadelestir(unvan);
  for (const [desen, etiket] of MESLEK_ETIKETLERI) if (desen.test(s)) return etiket;
  return null;
}

/**
 * Ad soyaddan adres önerileri — en akılda kalandan başlayarak.
 *
 * Rastgele sayı/harf EKLENMEZ: QR'ın altında da yazan bu adres kişinin
 * kendisini anlatmalı. Sıra: yalnız ad (en kısa, en kişisel) → ad+soyad →
 * baş harf+soyad → unvandan gelen etiketle birleşimler → soyad. Hangilerinin
 * boşta olduğuna sunucu bakar; form boşta olanları gösterir.
 */
export function kartvizitAdresOnerileri(fullName: string, unvan?: string | null, enCok = 8): string[] {
  const kelimeler = kartvizitSadelestir(fullName).split(" ").filter(Boolean);
  if (!kelimeler.length) return [];
  const ad = kelimeler[0];
  const soyad = kelimeler.length > 1 ? kelimeler[kelimeler.length - 1] : "";
  const orta = kelimeler.slice(1, -1);
  const etiket = kartvizitMeslekEtiketi(unvan);

  const adaylar: string[] = [ad];
  if (soyad) {
    adaylar.push(`${ad}${soyad}`, `${ad}-${soyad}`, `${ad[0]}${soyad}`, `${ad}${soyad[0]}`);
  }
  if (etiket) {
    adaylar.push(etiket === "dr" || etiket === "av" ? `${etiket}${ad}` : `${ad}-${etiket}`);
    if (soyad) adaylar.push(etiket === "dr" || etiket === "av" ? `${etiket}-${soyad}` : `${soyad}-${etiket}`);
  }
  for (const o of orta) adaylar.push(`${ad}${o}`, `${ad}-${o}`);
  if (soyad) adaylar.push(soyad, `${ad}-${soyad[0]}`);
  adaylar.push(`ben${ad}`, `${ad}-kart`);

  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const a of adaylar) {
    if (gorulen.has(a) || kartvizitAdresHatasi(a)) continue;
    gorulen.add(a);
    sonuc.push(a);
    if (sonuc.length >= enCok) break;
  }
  return sonuc;
}

// ---------------------------------------------------------------- vCard

function vcfKacir(deger: string): string {
  return deger.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

/** RFC 6350 satır katlama: 75 karakterden uzun satır, boşlukla başlayan devam satırlarına bölünür. */
function katla(satir: string): string[] {
  if (satir.length <= 75) return [satir];
  const parcalar = [satir.slice(0, 75)];
  for (let i = 75; i < satir.length; i += 74) parcalar.push(" " + satir.slice(i, i + 74));
  return parcalar;
}

export interface KartvizitVcardGirdisi {
  adres: string;
  fullName: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  location?: string | null;
  sosyal: KartvizitSosyal;
}

/**
 * Rehbere eklenecek kişi kaydı. `foto` base64 JPEG (verilirse kayda gömülür;
 * iPhone kişiyi fotoğrafıyla kaydeder). Unvanın dilini çağıran seçer.
 */
export function kartvizitVcard(k: KartvizitVcardGirdisi, foto?: { base64: string; tur: "JPEG" | "PNG" }): string {
  const kelimeler = k.fullName.trim().split(/\s+/);
  const soyad = kelimeler.length > 1 ? kelimeler[kelimeler.length - 1] : "";
  const ad = kelimeler.length > 1 ? kelimeler.slice(0, -1).join(" ") : kelimeler[0] ?? "";
  const satirlar = ["BEGIN:VCARD", "VERSION:3.0", `N:${vcfKacir(soyad)};${vcfKacir(ad)};;;`, `FN:${vcfKacir(k.fullName.trim())}`];
  if (k.title) satirlar.push(`TITLE:${vcfKacir(k.title)}`);
  if (k.phone) satirlar.push(`TEL;TYPE=CELL,VOICE:${vcfKacir(k.phone)}`);
  if (k.email) satirlar.push(`EMAIL;TYPE=INTERNET:${vcfKacir(k.email)}`);
  if (k.website) satirlar.push(`URL:${vcfKacir(k.website)}`);
  if (k.location) satirlar.push(`ADR;TYPE=WORK:;;;${vcfKacir(k.location)};;;`);
  for (const tanim of KARTVIZIT_SOSYAL) {
    const t = k.sosyal[tanim.anahtar];
    if (t) satirlar.push(`X-SOCIALPROFILE;TYPE=${tanim.anahtar === "x" ? "twitter" : tanim.anahtar}:${tanim.adres(t)}`);
  }
  satirlar.push(`NOTE:${vcfKacir(kartvizitAdresi(k.adres))}`);
  if (foto) satirlar.push(`PHOTO;ENCODING=b;TYPE=${foto.tur}:${foto.base64}`);
  satirlar.push("END:VCARD");
  return satirlar.flatMap(katla).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- QR

export const KARTVIZIT_QR_RENKLERI = {
  koyu: "#1C222C",
  vurgu: "#C0813F",
  zemin: "#FFFFFF",
} as const;

function xmlKacir(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Logolu, Projelio renklerinde QR kodu (SVG metni).
 *
 * Tasarım: veri modülleri yuvarlak noktalar; üç köşedeki konum işaretleri
 * yuvarlatılmış koyu çerçeve + ortasında Projelio turuncusu kare; tam ortada
 * beyaz bir plaka üstünde Projelio işareti. Hata düzeltme H (%30): logonun
 * kapattığı modüller okumayı bozmaz.
 *
 * `cerceve` verilirse QR bir kartın içine alınır, altına ad ve adres yazılır —
 * indirilen/basılan sürüm bu. Verilmezse yalnız QR (sayfadaki önizleme).
 */
export function kartvizitQrSvg(metin: string, cerceve?: { ad: string; adresMetni: string; altyazi?: string }): string {
  const qr = qrcode(0, "H");
  qr.addData(metin);
  qr.make();
  const n = qr.getModuleCount();
  const bosluk = 4;
  const boy = n + bosluk * 2;
  const { koyu, vurgu, zemin } = KARTVIZIT_QR_RENKLERI;

  // Orta plaka: modül sayısının ~%24'ü, tek sayıya yuvarlanır ki tam ortada dursun.
  let plaka = Math.round(n * 0.24);
  if (plaka % 2 === 0) plaka += 1;
  const plakaBas = (n - plaka) / 2;
  const plakadaMi = (r: number, c: number) =>
    r >= plakaBas - 0.5 && r < plakaBas + plaka + 0.5 && c >= plakaBas - 0.5 && c < plakaBas + plaka + 0.5;
  const isaretteMi = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  const noktalar: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || isaretteMi(r, c) || plakadaMi(r, c)) continue;
      noktalar.push(`M${c + bosluk + 0.5} ${r + bosluk + 0.08}a.42 .42 0 1 0 .001 0z`);
    }
  }

  const isaret = (x: number, y: number) => {
    const X = x + bosluk;
    const Y = y + bosluk;
    return (
      `<rect x="${X + 0.5}" y="${Y + 0.5}" width="6" height="6" rx="1.9" fill="none" stroke="${koyu}" stroke-width="1"/>` +
      `<rect x="${X + 2}" y="${Y + 2}" width="3" height="3" rx="0.9" fill="${vurgu}"/>`
    );
  };

  const pX = plakaBas + bosluk;
  const logoPay = plaka * 0.14;
  const qrIc =
    `<rect width="${boy}" height="${boy}" rx="${boy * 0.06}" fill="${zemin}"/>` +
    `<path d="${noktalar.join("")}" fill="${koyu}"/>` +
    isaret(0, 0) +
    isaret(n - 7, 0) +
    isaret(0, n - 7) +
    `<rect x="${pX}" y="${pX}" width="${plaka}" height="${plaka}" rx="${plaka * 0.24}" fill="${zemin}"/>` +
    `<image href="${PROJELIO_LOGO_PNG_DATA_URI}" x="${pX + logoPay}" y="${pX + logoPay}" width="${plaka - logoPay * 2}" height="${plaka - logoPay * 2}"/>`;

  if (!cerceve) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${boy} ${boy}" shape-rendering="geometricPrecision">${qrIc}</svg>`;
  }

  // Çerçeveli sürüm: QR üstte, altında ad, adres ve küçük "Projelio" imzası.
  // Birim: QR modülü. Genişlik QR + iki yanda 3 modül pay.
  const pay = 3;
  const G = boy + pay * 2;
  const yaziAlani = 15;
  const H = boy + pay * 2 + yaziAlani;
  const font = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const altyazi = cerceve.altyazi ?? "projelio";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G} ${H}" shape-rendering="geometricPrecision">` +
    `<rect width="${G}" height="${H}" rx="${G * 0.07}" fill="${zemin}"/>` +
    `<rect x=".25" y=".25" width="${G - 0.5}" height="${H - 0.5}" rx="${G * 0.07}" fill="none" stroke="#E3E6EB" stroke-width=".5"/>` +
    `<g transform="translate(${pay} ${pay})">${qrIc}</g>` +
    `<text x="${G / 2}" y="${boy + pay + 5}" text-anchor="middle" font-family="${font}" font-size="3.4" font-weight="700" fill="${koyu}">${xmlKacir(cerceve.ad)}</text>` +
    `<text x="${G / 2}" y="${boy + pay + 9.4}" text-anchor="middle" font-family="${font}" font-size="2.5" font-weight="500" fill="${vurgu}">${xmlKacir(cerceve.adresMetni)}</text>` +
    `<rect x="${G / 2 - 7}" y="${boy + pay + 11.6}" width="14" height=".25" fill="#E3E6EB"/>` +
    `<text x="${G / 2}" y="${boy + pay + 14.2}" text-anchor="middle" font-family="${font}" font-size="1.7" font-weight="600" letter-spacing=".35" fill="#66707F">${xmlKacir(altyazi)}</text>` +
    `</svg>`
  );
}
