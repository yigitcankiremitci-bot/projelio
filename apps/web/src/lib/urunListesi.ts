import type { Product, ProductKind, ProductStatus } from "@projelio/shared";
import { brutKarMarji, stokDurumu } from "./urunKarti";

// Ürün/Hizmet sekmesinin arama, filtre, sıralama ve kategori sayımları.
//
// Hepsi TARAYICIDA: liste ucu kataloğun tamamını zaten tek seferde dönüyor
// (3.586 ürünlük Net Sağlık kataloğu, 2026-11-11) ve her tuş vuruşunda sunucuya
// gitmek, aynı veriyi yeniden indirmekten başka bir şey yapmazdı. Fonksiyonlar
// saf — arayüzden bağımsız test edilsin diye (bkz. urunListesi.test.ts).

/** "Kategorisiz" / "Markasız" kovası. Boş dize: gerçek bir değerle çakışmaz. */
export const BOS_DEGER = "";

export type StokFiltresi = "" | "tukendi" | "kritik" | "yeterli" | "girilmemis";
export type FotoFiltresi = "" | "var" | "yok";

export interface UrunFiltresi {
  arama: string;
  tur: "" | ProductKind;
  durum: "" | ProductStatus;
  stok: StokFiltresi;
  foto: FotoFiltresi;
  /** Seçili kategoriler (VEYA). `BOS_DEGER` = kategorisi girilmemiş ürünler. */
  kategoriler: string[];
  /** Seçili markalar (VEYA). `BOS_DEGER` = markası girilmemiş ürünler. */
  markalar: string[];
  fiyatMin?: number;
  fiyatMax?: number;
}

export const BOS_FILTRE: UrunFiltresi = {
  arama: "",
  tur: "",
  durum: "",
  stok: "",
  foto: "",
  kategoriler: [],
  markalar: [],
};

export type UrunSiralama =
  | "varsayilan"
  | "ad-artan"
  | "ad-azalan"
  | "fiyat-artan"
  | "fiyat-azalan"
  | "stok-artan"
  | "stok-azalan"
  | "marj-azalan"
  | "yeni"
  | "eski"
  | "kod";

export const SIRALAMALAR: UrunSiralama[] = [
  "varsayilan",
  "ad-artan",
  "ad-azalan",
  "fiyat-artan",
  "fiyat-azalan",
  "stok-artan",
  "stok-azalan",
  "marj-azalan",
  "yeni",
  "eski",
  "kod",
];

export type UrunGorunumu = "kart" | "kompakt" | "liste";

/**
 * Aramada karşılaştırılan biçim: küçük harf (Türkçe kuralıyla — "İ" → "i"),
 * aksansız. Kullanıcı "sampuan" yazınca "Şampuan" bulunsun; Excel'den gelen
 * büyük harfli adlarda "ITRİYAT" ile "itriyat" aynı şey olsun.
 */
export function aramaBicimi(metin: string): string {
  return metin
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Ürün başına arama metni bir kez hesaplanır. Ürün nesnesi her yüklemede yeni
// geldiği için WeakMap eskileri kendiliğinden bırakır.
const samanlikOnbellegi = new WeakMap<Product, { ad: string; kod: string; tum: string }>();

function samanlik(p: Product) {
  let s = samanlikOnbellegi.get(p);
  if (!s) {
    const ad = aramaBicimi(p.name ?? "");
    const kod = aramaBicimi([p.sku, p.barcode].filter(Boolean).join(" "));
    const tum = [ad, kod, aramaBicimi([p.brand, p.category, p.description].filter(Boolean).join(" "))].join(" ");
    s = { ad, kod, tum };
    samanlikOnbellegi.set(p, s);
  }
  return s;
}

export function fotografVar(p: Product): boolean {
  if ((p.images?.length ?? 0) > 0) return true;
  return !!p.coverImageUrl && !p.coverImageUrl.startsWith("preset:");
}

function stokKovasi(p: Product): Exclude<StokFiltresi, ""> | "hizmet" {
  if (p.kind === "service") return "hizmet";
  const d = stokDurumu(p.stockQuantity, p.minStock);
  return d === "yok" ? "girilmemis" : d;
}

/** Aramadaki her kelime ürünün bir yerinde geçmeli (VE). Boş arama her şeyi tutar. */
function aramaTutar(p: Product, kelimeler: string[]): boolean {
  if (kelimeler.length === 0) return true;
  const { tum } = samanlik(p);
  return kelimeler.every((k) => tum.includes(k));
}

function kelimeler(arama: string): string[] {
  const b = aramaBicimi(arama);
  return b ? b.split(" ") : [];
}

type Haric = "kategori" | "marka" | null;

function tutar(p: Product, f: UrunFiltresi, kelime: string[], haric: Haric): boolean {
  if (f.tur && p.kind !== f.tur) return false;
  if (f.durum && p.status !== f.durum) return false;
  if (f.stok) {
    const k = stokKovasi(p);
    if (k !== f.stok) return false;
  }
  if (f.foto && fotografVar(p) !== (f.foto === "var")) return false;
  if (f.fiyatMin !== undefined || f.fiyatMax !== undefined) {
    if (p.price === undefined || p.price === null) return false;
    if (f.fiyatMin !== undefined && p.price < f.fiyatMin) return false;
    if (f.fiyatMax !== undefined && p.price > f.fiyatMax) return false;
  }
  if (haric !== "kategori" && f.kategoriler.length > 0 && !f.kategoriler.includes(temiz(p.category))) return false;
  if (haric !== "marka" && f.markalar.length > 0 && !f.markalar.includes(temiz(p.brand))) return false;
  return aramaTutar(p, kelime);
}

function temiz(v?: string): string {
  return (v ?? "").trim();
}

const harmanlayici = new Intl.Collator("tr-TR", { numeric: true, sensitivity: "base" });

/** Boş değer hangi yönde sıralanırsa sıralansın SONA düşer: "fiyatı girilmemiş" en ucuz değildir. */
function sayiKarsilastir(a: number | null | undefined, b: number | null | undefined, yon: 1 | -1): number {
  const aBos = a === undefined || a === null;
  const bBos = b === undefined || b === null;
  if (aBos && bBos) return 0;
  if (aBos) return 1;
  if (bBos) return -1;
  return (a - b) * yon;
}

function varsayilanKarsilastir(a: Product, b: Product): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
}

/**
 * Arama varken "Önerilen" sıralama alaka sırasıdır: adı aranan kelimeyle
 * başlayan → stok kodu/barkodu birebir tutan → adında geçen → başka bir yerde
 * (marka, açıklama) geçen. Barkod okutan kullanıcı ürünü ilk sırada görsün.
 */
function alaka(p: Product, ifade: string): number {
  const { ad, kod } = samanlik(p);
  if (kod && kod.split(" ").includes(ifade)) return 0;
  if (ad.startsWith(ifade)) return 1;
  if (ad.includes(ifade)) return 2;
  if (kod.includes(ifade)) return 3;
  return 4;
}

export function siralaUrunler(liste: Product[], siralama: UrunSiralama, arama = ""): Product[] {
  const s = [...liste];
  switch (siralama) {
    case "ad-artan":
      return s.sort((a, b) => harmanlayici.compare(a.name, b.name));
    case "ad-azalan":
      return s.sort((a, b) => harmanlayici.compare(b.name, a.name));
    case "fiyat-artan":
      return s.sort((a, b) => sayiKarsilastir(a.price, b.price, 1) || harmanlayici.compare(a.name, b.name));
    case "fiyat-azalan":
      return s.sort((a, b) => sayiKarsilastir(a.price, b.price, -1) || harmanlayici.compare(a.name, b.name));
    case "stok-artan":
      return s.sort((a, b) => sayiKarsilastir(stokSayisi(a), stokSayisi(b), 1) || harmanlayici.compare(a.name, b.name));
    case "stok-azalan":
      return s.sort((a, b) => sayiKarsilastir(stokSayisi(a), stokSayisi(b), -1) || harmanlayici.compare(a.name, b.name));
    case "marj-azalan":
      return s.sort(
        (a, b) =>
          sayiKarsilastir(brutKarMarji(a.price, a.costPrice), brutKarMarji(b.price, b.costPrice), -1) ||
          harmanlayici.compare(a.name, b.name)
      );
    case "yeni":
      return s.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    case "eski":
      return s.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    case "kod":
      return s.sort((a, b) => {
        const ak = temiz(a.sku);
        const bk = temiz(b.sku);
        if (!ak && !bk) return harmanlayici.compare(a.name, b.name);
        if (!ak) return 1;
        if (!bk) return -1;
        return harmanlayici.compare(ak, bk);
      });
    case "varsayilan":
    default: {
      const ifade = aramaBicimi(arama);
      if (!ifade) return s.sort(varsayilanKarsilastir);
      return s.sort((a, b) => alaka(a, ifade) - alaka(b, ifade) || varsayilanKarsilastir(a, b));
    }
  }
}

/** Hizmetin stoğu sıralamada yok sayılır (kartta da gösterilmiyor). */
function stokSayisi(p: Product): number | undefined {
  return p.kind === "service" ? undefined : p.stockQuantity;
}

export function filtreleUrunler(liste: Product[], f: UrunFiltresi): Product[] {
  const k = kelimeler(f.arama);
  return liste.filter((p) => tutar(p, f, k, null));
}

export interface Kova {
  deger: string;
  sayi: number;
}

/**
 * Kategori ve marka listelerindeki sayılar. Her biri KENDİ seçimi hariç diğer
 * bütün filtrelere göre sayılır: "Kurtsan" seçiliyken kategori listesi yalnızca
 * Kurtsan'ın kategorilerini gösterir, ama marka listesi yine bütün markaları
 * gösterir — yoksa ikinci bir marka eklemenin yolu kalmazdı.
 */
export function kovalar(liste: Product[], f: UrunFiltresi): { kategoriler: Kova[]; markalar: Kova[] } {
  const k = kelimeler(f.arama);
  const kat = new Map<string, number>();
  const mar = new Map<string, number>();
  for (const p of liste) {
    if (tutar(p, f, k, "kategori")) {
      const d = temiz(p.category);
      kat.set(d, (kat.get(d) ?? 0) + 1);
    }
    if (tutar(p, f, k, "marka")) {
      const d = temiz(p.brand);
      mar.set(d, (mar.get(d) ?? 0) + 1);
    }
  }
  // Seçili olan sıfıra düşse de listede kalsın ki seçim kaldırılabilsin.
  for (const s of f.kategoriler) if (!kat.has(s)) kat.set(s, 0);
  for (const s of f.markalar) if (!mar.has(s)) mar.set(s, 0);
  const sirala = (m: Map<string, number>): Kova[] =>
    [...m.entries()]
      .map(([deger, sayi]) => ({ deger, sayi }))
      // Çoktan aza; eşitse alfabetik. "Kategorisiz" her zaman en sonda.
      .sort((a, b) => {
        if (a.deger === BOS_DEGER) return 1;
        if (b.deger === BOS_DEGER) return -1;
        return b.sayi - a.sayi || harmanlayici.compare(a.deger, b.deger);
      });
  return { kategoriler: sirala(kat), markalar: sirala(mar) };
}

export interface HizliSayilar {
  tukendi: number;
  kritik: number;
  fotografsiz: number;
  satisDisi: number;
  hizmet: number;
  urun: number;
}

/** Üstteki hızlı filtre çiplerinin sayıları — kataloğun tamamı üzerinden. */
export function hizliSayilar(liste: Product[]): HizliSayilar {
  const s: HizliSayilar = { tukendi: 0, kritik: 0, fotografsiz: 0, satisDisi: 0, hizmet: 0, urun: 0 };
  for (const p of liste) {
    const k = stokKovasi(p);
    if (k === "tukendi") s.tukendi++;
    else if (k === "kritik") s.kritik++;
    if (!fotografVar(p)) s.fotografsiz++;
    if (p.status === "inactive") s.satisDisi++;
    if (p.kind === "service") s.hizmet++;
    else s.urun++;
  }
  return s;
}

/** Kaç filtre etkin — "Filtreler (3)" düğmesi ve "Temizle" için. Arama sayılmaz. */
export function etkinFiltreSayisi(f: UrunFiltresi): number {
  return (
    (f.tur ? 1 : 0) +
    (f.durum ? 1 : 0) +
    (f.stok ? 1 : 0) +
    (f.foto ? 1 : 0) +
    f.kategoriler.length +
    f.markalar.length +
    (f.fiyatMin !== undefined || f.fiyatMax !== undefined ? 1 : 0)
  );
}

/**
 * Süzülmüş listenin CSV'si. Ayraç noktalı virgül ve başta BOM: Türkçe Excel
 * virgülü ondalık ayracı sayıyor, BOM olmadan da "Ş"ler bozuk açılıyordu.
 */
export function urunlerCsv(liste: Product[], basliklar: string[]): string {
  const hucre = (v: unknown): string => {
    if (v === undefined || v === null) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const satirlar = liste.map((p) =>
    [
      p.name,
      p.kind,
      p.category,
      p.brand,
      p.sku,
      p.barcode,
      p.unit,
      p.price,
      p.currency,
      p.costPrice,
      p.taxRate,
      p.kind === "service" ? undefined : p.stockQuantity,
      p.minStock,
      p.status,
    ]
      .map(hucre)
      .join(";")
  );
  return "﻿" + [basliklar.map(hucre).join(";"), ...satirlar].join("\r\n");
}
