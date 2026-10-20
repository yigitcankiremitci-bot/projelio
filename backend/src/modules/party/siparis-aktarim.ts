// SİPARİŞ İÇE AKTARMA — saf planlayıcı (veritabanına dokunmaz).
//
// Akış: kullanıcı Müşteriler > Tahsilat'tan sipariş listesini yükler
// (POST organizations/:id/siparisler/import). Bu dosya tabloyu okur ve
// "ne yazılacak" planını çıkarır; önizleme bu planı gösterir, kullanıcı
// düzeltir, aynı dosya düzeltmelerle gelince SiparisAktarimService planı
// yazar. Plan iki adımda da AYNI koddan çıkar — önizlemede görülen ile
// yazılan ayrışmasın.
//
// İki tablo biçimi tanınır:
//   * GENİŞ — ürün başına bir sütun, hücrede adet (kargo/sevkiyat dökümü:
//     "TARİH; ÇIKIŞ YERİ; İSİM; SOYİSİM; TUTAR; VACROL; SPREY; ..."). İlk
//     gerçek yükleme (CARMED İLAÇ, 2026-10) bu biçimde geldi.
//   * UZUN — satır başına bir kalem ("Ürün", "Miktar"); aynı sipariş
//     numaralı satırlar tek siparişte toplanır.
//
// TUTAR ESAS (kullanıcı kararı, 2026-10-20): siparişin toplamı dosyadaki
// tutardır; kalemlere katalog fiyatı (KDV dahil) oranında dağıtılır. Katalog
// fiyatı kalemde ayrıca saklanır, pazaryeri fiyatı ya da eczane iskontosu
// "katalogdan %x sapma" olarak görünür. Tutarı olmayan satır ALINMAZ:
// tahmin edilen bir tutar gerçekte kesilmemiş bir alacak olurdu.
//
// ALICI: dosyadaki kişi mevcut müşteri kartıyla eşleşirse ona; eşleşmeyen
// ama dosyada 2+ siparişi olan için yeni kart; tek seferlik alıcı kanala
// toplanır (müşterisiz sipariş, alıcı adı siparişte). Eşleşme eczane adı
// üzerinden: "ŞEYMA KOÇAK KOÇAK ECZ" → "Koçak Eczanesi". Pazaryeri alıcısı
// eczaneyle eşleştirilmez — "MERVE ZENGİN" Trendyol siparişi "Merve
// Eczanesi"ne yazılırsa bir eczanenin cirosu bir son kullanıcıdan şişerdi.
//
// Dekoratör YOK: Node'un test koşucusu dekoratörlü dosyayı çözemiyor
// (bkz. musteri-sablonu.ts ile aynı ayrım).

import { createHash } from "node:crypto";
import {
  kalemleriOrantila,
  type AliciKarari,
  type OdemeYontemi,
  type SatisKanaliTuru,
  type SiparisAktarimAlicisi,
  type SiparisAktarimDuzeltmeleri,
  type SiparisAktarimKanali,
  type SiparisAktarimUrunSutunu,
} from "@projelio/shared";
import type { SheetData } from "../ai-assistant/ai-sheet-import";
import type { KalemSatiri } from "./siparis.service";

// ============================================================ Girdi

export interface KatalogUrunu {
  id: string;
  name: string;
  sku?: string | null;
  /** KDV dahil katalog fiyatı. */
  liste?: number | null;
  unit?: string | null;
}

export interface MevcutMusteri {
  id: string;
  displayName: string;
  city?: string | null;
}

export interface MevcutKanal {
  id: string;
  ad: string;
  tur: SatisKanaliTuru;
  varsayilanVadeGun: number;
  varsayilanOdemeYontemi: OdemeYontemi;
}

export interface AktarimBaglami {
  organizationId: string;
  katalog: KatalogUrunu[];
  musteriler: MevcutMusteri[];
  kanallar: MevcutKanal[];
  dosyaAdi?: string;
  /** Yeni kart için en az kaç sipariş (kullanıcı kararı: 2). */
  yeniKartEsigi?: number;
}

// ============================================================ Plan

export interface PlanlananSiparis {
  satir: number;
  anahtar: string;
  kanalAdi?: string;
  siparis: Record<string, unknown>;
  kalemler: KalemSatiri[];
}

export interface SiparisAktarimPlani {
  dosyaSatiri: number;
  siparisler: PlanlananSiparis[];
  urunSutunlari: SiparisAktarimUrunSutunu[];
  kanallar: SiparisAktarimKanali[];
  alicilar: SiparisAktarimAlicisi[];
  atlanan: { satir: number; neden: string; ozet: string }[];
  /** Başlangıç tarihinden önceki satır sayısı (tek tek listelenmez). */
  oncekiSatir: number;
}

// ============================================================ Metin yardımcıları

/** Türkçe büyük/küçük harf + aksanları ASCII'ye indirir, noktalamayı ayırıcı yapar. */
export function sade(raw: unknown): string {
  return String(raw ?? "")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/ı/g, "i")
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function kelimeler(raw: unknown): string[] {
  const s = sade(raw);
  return s ? s.split(" ") : [];
}

/** "AYŞE TUĞBA" → "Ayşe Tuğba" (Türkçe i/ı doğru). */
export function baslikHarfi(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase("tr") + w.slice(1).toLocaleLowerCase("tr") : w))
    .join(" ");
}

/**
 * Türkçe para metni → sayı. "₺2.323,00" · "2.323" (binlik) · "2323,5" ·
 * "2323.5" (Excel'in kendi sayısı). Okunamazsa null.
 */
export function tutarOku(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? "")
    .replace(/[₺\s]|TL|TRY/gi, "")
    .trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** "1.08.2026" · "01/08/2026" · "2026-08-01" → "2026-08-01". Okunamazsa null. */
export function tarihOku(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return gecerliTarih(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return gecerliTarih(+m[3], +m[2], +m[1]);
  return null;
}

function gecerliTarih(y: number, a: number, g: number): string | null {
  const d = new Date(Date.UTC(y, a - 1, g));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return null;
  return d.toISOString().slice(0, 10);
}

/** Hücredeki adet: "1", "2", "1,5". "1S", "İPTAL EDİLDİ" gibi metin → NaN. Boş → 0. */
function adetOku(raw: unknown): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  if (!/^\d+([.,]\d+)?$/.test(s)) return NaN;
  return Number(s.replace(",", "."));
}

// ============================================================ Sütunlar

const SUTUN_ESADLARI: Record<string, string[]> = {
  tarih: ["tarih", "siparis tarihi", "tarihi", "date"],
  kanal: ["cikis yeri", "kanal", "satis kanali", "platform", "magaza"],
  ad: ["isim", "ad", "adi", "alici", "alici adi", "musteri", "musteri adi", "unvan"],
  soyad: ["soyisim", "soyad", "soyadi"],
  il: ["il", "sehir"],
  ilce: ["ilce"],
  tutar: ["tutar", "toplam", "toplam tutar", "siparis tutari", "fiyat toplami"],
  siparisNo: ["siparis no", "siparis numarasi", "no"],
  urun: ["urun", "urun adi", "stok kodu", "sku"],
  miktar: ["miktar", "adet"],
  birimFiyat: ["birim fiyat", "fiyat"],
  notlar: ["not", "notlar", "aciklama"],
};

type Sutun = keyof typeof SUTUN_ESADLARI;

/** Başlık satırı: "tarih" ve bir ad sütunu içeren ilk satır (üstte başlık/boşluk olabilir). */
function baslikSatiriBul(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = rows[i].map(sade);
    if (h.some((x) => SUTUN_ESADLARI.tarih.includes(x)) && h.some((x) => SUTUN_ESADLARI.ad.includes(x))) return i;
  }
  return -1;
}

function sutunlariCoz(baslik: string[]): Partial<Record<Sutun, number>> {
  const h = baslik.map(sade);
  const out: Partial<Record<Sutun, number>> = {};
  for (const [alan, adlar] of Object.entries(SUTUN_ESADLARI) as [Sutun, string[]][]) {
    const i = h.findIndex((x) => adlar.includes(x));
    if (i >= 0) out[alan] = i;
  }
  return out;
}

// ============================================================ Ürün sütunu → katalog

/**
 * Sütun başlığını katalogdaki ürüne bağlar.
 *
 * Başlığın her kelimesi ürün adında geçmeli: kısa kelime (1-2 harf: "M",
 * "C", "3") TAM eşleşir, uzunu ön ek olarak ("TUZ" → "Tuzu", "KREM" →
 * "Kremi"). Birden çok aday varsa sırayla elenir:
 *   1. Tek adaylı başlıklar önce bağlanır ve o ürün diğer başlıkların
 *      adaylığından düşer ("S-MİX" → S-Mix Damla bağlanınca "DAMLA" geriye
 *      Vacrol Damla ile kalır).
 *   2. Hâlâ birden çoksa paket/set ürünleri düşer (birim "paket"): "SABUN"
 *      sütunu 5'li set değil, tek sabundur.
 * Sonunda tek aday kalmazsa bağlanmaz; adaylar önizlemede seçilir.
 */
export function urunSutunlariniEsle(
  basliklar: string[],
  katalog: KatalogUrunu[]
): Map<string, { productId?: string; adaylar: KatalogUrunu[] }> {
  const urunKelimeleri = katalog.map((u) => ({ u, k: kelimeler(u.name) }));
  const sku = new Map(katalog.filter((u) => u.sku).map((u) => [sade(u.sku), u]));
  const adaylar = new Map<string, KatalogUrunu[]>();
  for (const b of basliklar) {
    const bk = kelimeler(b);
    const kod = sku.get(sade(b));
    if (kod) {
      adaylar.set(b, [kod]);
      continue;
    }
    if (bk.length === 0) {
      adaylar.set(b, []);
      continue;
    }
    adaylar.set(
      b,
      urunKelimeleri
        .filter(({ k }) => bk.every((w) => k.some((x) => (w.length <= 2 ? x === w : x.startsWith(w)))))
        .map(({ u }) => u)
    );
  }

  const bagli = new Map<string, string>();
  const kullanilan = new Set<string>();
  for (let tur = 0; tur < basliklar.length; tur++) {
    let ilerledi = false;
    for (const b of basliklar) {
      if (bagli.has(b)) continue;
      let kalan = (adaylar.get(b) ?? []).filter((u) => !kullanilan.has(u.id));
      if (kalan.length > 1) {
        const tekil = kalan.filter((u) => sade(u.unit) !== "paket");
        if (tekil.length >= 1) kalan = tekil;
      }
      if (kalan.length === 1) {
        bagli.set(b, kalan[0].id);
        kullanilan.add(kalan[0].id);
        ilerledi = true;
      }
    }
    if (!ilerledi) break;
  }

  const out = new Map<string, { productId?: string; adaylar: KatalogUrunu[] }>();
  for (const b of basliklar) {
    const id = bagli.get(b);
    // Bağlanamayan başlıkta aday yoksa kullanıcı tüm katalogdan seçer (arayüz).
    out.set(b, { productId: id, adaylar: id ? [] : (adaylar.get(b) ?? []).filter((u) => !kullanilan.has(u.id)) });
  }
  return out;
}

// ============================================================ Alıcı → müşteri kartı

/** Eczane belirteçleri: "ECZ", "ECZANESİ", "ECZANE", yaygın yazım hatası "EZC". */
const ECZANE_BELIRTECI = new Set(["ecz", "eczanesi", "eczane", "ezc", "eczacilik"]);
/** Kart adından atılan, eşleşmeye katılmayan kelimeler. */
const KART_DOLGU = new Set([...ECZANE_BELIRTECI, "optik", "ltd", "sti", "as"]);

interface KartAnahtari {
  musteri: MevcutMusteri;
  kelimeler: string[];
  /** "Mavi Eczanesi (Çiğli)" → ["cigli"] — aynı adlı kartları ayırır. */
  semt: string[];
}

function kartAnahtarlari(musteriler: MevcutMusteri[]): KartAnahtari[] {
  return musteriler
    .map((m) => {
      const parantez = /\(([^)]*)\)/.exec(m.displayName)?.[1] ?? "";
      const ad = m.displayName.replace(/\([^)]*\)/g, " ");
      return {
        musteri: m,
        kelimeler: kelimeler(ad).filter((w) => !KART_DOLGU.has(w)),
        semt: [...kelimeler(parantez), ...kelimeler(m.city)],
      };
    })
    .filter((k) => k.kelimeler.length > 0);
}

/** Dizinin sonu verilen kelime dizisiyle bitiyor mu. */
function ileBiter(dizi: string[], son: string[]): boolean {
  if (son.length === 0 || son.length > dizi.length) return false;
  const bas = dizi.length - son.length;
  return son.every((w, i) => dizi[bas + i] === w);
}

export interface KartEslesmesi {
  adaylar: MevcutMusteri[];
  guven: "kesin" | "olasi";
}

/**
 * Alıcının yazılışından mevcut kartı bulur.
 *
 * Eczane adı alıcı satırının SONUNDA yazılıyor: "<eczacı adı soyadı>
 * <eczane adı> ECZ". Belirteç varsa belirteçten önceki kelimeler kart adıyla
 * BİTMELİ (kesin): "BAŞAK KOÇAK BAŞAK ECZ" Koçak Eczanesi DEĞİLDİR — eczane
 * "Başak", soyadı Koçak. Belirteç yoksa (yalnızca eczane kanalında bakılır)
 * aynı kural tüm satıra uygulanır ama ilk kelime (eczacının adı) tek başına
 * eşleşme sayılmaz (olası).
 *
 * Aynı adlı birden çok kart ("Mavi Eczanesi" Çiğli / Sarıyer / Üsküdar)
 * il-ilçe-semt kelimesiyle daraltılır; daralmazsa hepsi aday döner.
 */
export function karttaEsle(
  alici: { kelimeler: string[]; yer: string[] },
  anahtarlar: KartAnahtari[],
  eczaneKanali: boolean
): KartEslesmesi | null {
  const w = alici.kelimeler;
  const b = w.findIndex((x) => ECZANE_BELIRTECI.has(x));
  let govde: string[];
  let guven: "kesin" | "olasi";
  if (b >= 0) {
    govde = w.slice(0, b);
    guven = "kesin";
  } else if (eczaneKanali) {
    govde = w;
    guven = "olasi";
  } else {
    return null;
  }

  let adaylar = anahtarlar.filter((k) => ileBiter(govde, k.kelimeler) && (guven === "kesin" || govde.length > k.kelimeler.length));
  if (adaylar.length === 0) return null;
  // En uzun eşleşen ad kazanır: "Yeni Bağlıca" varken "Bağlıca" ya da "Yeni" değil.
  const enUzun = Math.max(...adaylar.map((k) => k.kelimeler.length));
  adaylar = adaylar.filter((k) => k.kelimeler.length === enUzun);
  if (adaylar.length > 1) {
    const yer = new Set([...alici.yer, ...w]);
    const daralan = adaylar.filter((k) => k.semt.some((s) => yer.has(s)));
    if (daralan.length >= 1) adaylar = daralan;
  }
  return { adaylar: adaylar.map((k) => k.musteri), guven };
}

// ============================================================ Kanal

/** Dosyadaki kanal adından tür tahmini; önizlemede değiştirilir. */
export function kanalTuruTahmini(ad: string): SatisKanaliTuru {
  const s = sade(ad);
  if (/trendyol|hepsi ?burada|farmazon|n11|amazon|ciceksepeti|pazarama/.test(s)) return "pazaryeri";
  if (/^ecz|eczane/.test(s)) return "eczane";
  if (/^dr\b|doktor|hekim/.test(s)) return "doktor";
  if (/bayi|distributor|depo/.test(s)) return "bayi";
  return "diger";
}

/**
 * Türün varsayılan vadesi (plan, 2026-10-20): pazaryeri 30 gün sonra öder,
 * eczane 60 gün. Önizlemede kanal kanal düzeltilir.
 */
export const TUR_VADESI: Record<SatisKanaliTuru, number> = {
  pazaryeri: 30,
  web: 0,
  eczane: 60,
  doktor: 30,
  bayi: 60,
  diger: 30,
};

// ============================================================ Satır atlama

/**
 * Satış olmayan gönderiler: numune, misafir ikramı, iptal. Kullanıcı kararı
 * (2026-10-20): alınmasın, sonra bakılacak.
 */
const SATIS_DISI = /misafir|numune|hediye|ikram|calisma icin|iptal/;

// ============================================================ Atlama nedenleri
//
// Önizlemede kullanıcıya gösterilir ve arayüzde t() ile çevrilir (veri olarak
// gelir); bu yüzden metinler tek yerde ve dil denetiminin gördüğü blokta.
// dil:anahtar-baslangic
export const NEDEN = {
  tutarYok: "Tutar yok",
  urunYok: "Ürün yok",
  toplamSatiri: "Toplam satırı",
  aliciAdiYok: "Alıcı adı yok",
  tarihOkunamadi: "Tarih okunamadı",
  satisDisi: "Satış dışı (numune / misafir / iptal)",
  adetOkunamadi: "Adet okunamadı",
  miktarOkunamadi: "Miktar okunamadı",
  aliciAtlandi: "Alıcı atlandı",
  kanalYok: "Kanal yok",
  baslikYok: 'Başlık satırı bulunamadı: tabloda "Tarih" ve "İsim" (ya da "Alıcı") sütunları olmalı.',
} as const;
// dil:anahtar-bitis

// ============================================================ Plan

interface OkunanSatir {
  satir: number;
  tarih: string;
  kanalAdi?: string;
  adHam: string;
  anahtar: string;
  kelimeler: string[];
  il?: string;
  ilce?: string;
  tutar: number;
  siparisNo?: string;
  notlar?: string;
  /** başlık → adet (geniş biçim) ya da ürün yazısı → adet (uzun biçim). */
  urunler: { baslik: string; adet: number; birimFiyat?: number }[];
}

export function siparisPlaniCikar(
  sheet: SheetData,
  ctx: AktarimBaglami,
  d: SiparisAktarimDuzeltmeleri = {}
): SiparisAktarimPlani {
  const rows = sheet.rows;
  const bi = baslikSatiriBul(rows);
  if (bi < 0) {
    throw new Error(NEDEN.baslikYok);
  }
  const baslik = rows[bi].map((h) => String(h ?? "").trim());
  const s = sutunlariCoz(baslik);
  const uzun = s.urun !== undefined;

  // Geniş biçimde tanınan alanlar dışındaki dolu başlıklar ürün sütunudur.
  const alanSutunlari = new Set(Object.values(s));
  const urunBasliklari = uzun
    ? []
    : baslik.map((h, i) => ({ h, i })).filter(({ h, i }) => h && !alanSutunlari.has(i));

  const atlanan: SiparisAktarimPlani["atlanan"] = [];
  let oncekiSatir = 0;
  const okunan: OkunanSatir[] = [];
  const hucre = (r: string[], alan: Sutun) => (s[alan] !== undefined ? String(r[s[alan]!] ?? "").trim() : "");

  for (let i = bi + 1; i < rows.length; i++) {
    const r = rows[i];
    const no = i + 1;
    if (r.every((c) => !String(c ?? "").trim())) continue;
    const ad = [hucre(r, "ad"), hucre(r, "soyad")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const tutarHam = hucre(r, "tutar");
    const ozet = [hucre(r, "tarih"), hucre(r, "kanal"), ad, tutarHam].filter(Boolean).join(" · ");

    const tarih = tarihOku(hucre(r, "tarih"));
    if (tarih && d.baslangic && tarih < d.baslangic) {
      // Tek tek listelenmez: bir yıllık dökümde binlerce satır olur ve
      // kullanıcının kararıdır, hata değil.
      oncekiSatir += 1;
      continue;
    }
    if (!ad) {
      // Adı olmayan ama tutarı olan satır günün/listenin toplamıdır; sipariş
      // değil. Yalnızca tarihi yazılmış boş satır sessizce geçilir.
      const dolu = r.some((c, j) => j !== s.tarih && String(c ?? "").trim());
      if (dolu) atlanan.push({ satir: no, neden: tutarHam ? NEDEN.toplamSatiri : NEDEN.aliciAdiYok, ozet });
      continue;
    }
    if (!tarih) {
      atlanan.push({ satir: no, neden: NEDEN.tarihOkunamadi, ozet });
      continue;
    }
    if (SATIS_DISI.test(sade(ad))) {
      atlanan.push({ satir: no, neden: NEDEN.satisDisi, ozet });
      continue;
    }
    const tutar = tutarOku(tutarHam);
    if (tutar === null || tutar <= 0) {
      atlanan.push({ satir: no, neden: NEDEN.tutarYok, ozet });
      continue;
    }

    const urunler: OkunanSatir["urunler"] = [];
    let bozuk: string | null = null;
    if (uzun) {
      const adet = adetOku(hucre(r, "miktar") || "1");
      const urun = hucre(r, "urun");
      if (!urun || Number.isNaN(adet)) bozuk = urun ? `${NEDEN.miktarOkunamadi}: "${hucre(r, "miktar")}"` : NEDEN.urunYok;
      else urunler.push({ baslik: urun, adet, birimFiyat: tutarOku(hucre(r, "birimFiyat")) ?? undefined });
    } else {
      for (const { h, i: j } of urunBasliklari) {
        const adet = adetOku(r[j]);
        if (Number.isNaN(adet)) {
          bozuk = `${NEDEN.adetOkunamadi}: "${String(r[j]).trim()}" (${h})`;
          break;
        }
        if (adet > 0) urunler.push({ baslik: h, adet });
      }
    }
    if (bozuk) {
      atlanan.push({ satir: no, neden: bozuk, ozet });
      continue;
    }
    if (urunler.length === 0) {
      atlanan.push({ satir: no, neden: NEDEN.urunYok, ozet });
      continue;
    }

    okunan.push({
      satir: no,
      tarih,
      kanalAdi: hucre(r, "kanal") ? hucre(r, "kanal").replace(/\s+/g, " ") : undefined,
      adHam: ad,
      anahtar: kelimeler(ad).join(" "),
      kelimeler: kelimeler(ad),
      il: hucre(r, "il") || undefined,
      ilce: hucre(r, "ilce") || undefined,
      tutar,
      siparisNo: hucre(r, "siparisNo") || undefined,
      notlar: hucre(r, "notlar") || undefined,
      urunler,
    });
  }

  // ------------------------------------------------ Ürün sütunları
  const basliklar = uzun
    ? Array.from(new Set(okunan.flatMap((o) => o.urunler.map((u) => u.baslik))))
    : urunBasliklari.map((u) => u.h);
  const otomatik = urunSutunlariniEsle(basliklar, ctx.katalog);
  const katalogu = new Map(ctx.katalog.map((u) => [u.id, u]));
  const urunSutunlari: SiparisAktarimUrunSutunu[] = basliklar.map((b) => {
    const o = otomatik.get(b)!;
    const secilen = d.urunSutunlari && b in d.urunSutunlari ? d.urunSutunlari[b] : o.productId;
    const u = secilen ? katalogu.get(secilen) : undefined;
    return {
      baslik: b,
      productId: u?.id,
      productName: u?.name,
      adaylar: o.adaylar.map((x) => ({ id: x.id, name: x.name })),
      adet: okunan.reduce((t, x) => t + x.urunler.filter((y) => y.baslik === b).reduce((a, y) => a + y.adet, 0), 0),
    };
  });
  const sutunUrunu = new Map(urunSutunlari.map((u) => [u.baslik, u.productId]));
  // Kullanıcı açıkça "alma" dediyse (null) sütun yok sayılır; eşleşmemiş
  // sütun ise açıklamalı (ürünsüz) kalem olur — adet kaybolmasın.
  const alinmayan = new Set(
    Object.entries(d.urunSutunlari ?? {})
      .filter(([, v]) => v === null)
      .map(([k]) => k)
  );

  // ------------------------------------------------ Kanallar
  // "Trendyol" ile "TRENDYOL" aynı kanal: satırların kanal adı ilk görülen
  // yazılışa (ya da mevcut kanalın adına) eşitlenir. Eşitlenmeseydi iki yeni
  // kanal açılmaya çalışılır, ikincisi ad tekilliğine takılırdı.
  const mevcutKanal = new Map(ctx.kanallar.map((k) => [sade(k.ad), k]));
  const yazilis = new Map<string, string>();
  for (const o of okunan) {
    if (!o.kanalAdi) continue;
    const anahtar = sade(o.kanalAdi);
    if (!yazilis.has(anahtar)) yazilis.set(anahtar, mevcutKanal.get(anahtar)?.ad ?? o.kanalAdi);
    o.kanalAdi = yazilis.get(anahtar);
  }
  const kanalOzet = new Map<string, SiparisAktarimKanali>();
  for (const o of okunan) {
    if (!o.kanalAdi || kanalOzet.has(o.kanalAdi)) continue;
    const m = mevcutKanal.get(sade(o.kanalAdi));
    const ayar = d.kanallar?.[o.kanalAdi] ?? {};
    // Mevcut kanalın ayarı kanaldan gelir; önizlemedeki düzeltme yalnızca
    // yeni açılacak kanala uygulanır (mevcut kanal Kanallar ekranından düzenlenir).
    const tur = m?.tur ?? ayar.tur ?? kanalTuruTahmini(o.kanalAdi);
    kanalOzet.set(o.kanalAdi, {
      ad: o.kanalAdi,
      kanalId: m?.id,
      yeni: !m,
      tur,
      vadeGun: m?.varsayilanVadeGun ?? ayar.vadeGun ?? TUR_VADESI[tur],
      odemeYontemi: m?.varsayilanOdemeYontemi ?? ayar.odemeYontemi ?? "havale",
      siparisSayisi: 0,
      tutar: 0,
    });
  }

  // ------------------------------------------------ Alıcılar
  const anahtarlar = kartAnahtarlari(ctx.musteriler);
  const musteriAdi = new Map(ctx.musteriler.map((m) => [m.id, m.displayName]));
  const gruplar = new Map<string, OkunanSatir[]>();
  for (const o of okunan) gruplar.set(o.anahtar, [...(gruplar.get(o.anahtar) ?? []), o]);

  const esik = ctx.yeniKartEsigi ?? 2;
  const alicilar: SiparisAktarimAlicisi[] = [];
  for (const [anahtar, satirlar] of gruplar) {
    // Grubun en güçlü eşleşmesi: bir satırda "ECZ" yazılmış, diğerinde
    // yazılmamış olabilir.
    let eslesme: KartEslesmesi | null = null;
    for (const o of satirlar) {
      const tur = o.kanalAdi ? kanalOzet.get(o.kanalAdi)?.tur : undefined;
      const e = karttaEsle(
        { kelimeler: o.kelimeler, yer: [...kelimeler(o.il), ...kelimeler(o.ilce)] },
        anahtarlar,
        tur === "eczane" || tur === "bayi"
      );
      if (e && (!eslesme || (e.guven === "kesin" && eslesme.guven !== "kesin") || e.adaylar.length < eslesme.adaylar.length)) {
        eslesme = e;
      }
    }

    const tutar = Math.round(satirlar.reduce((t, x) => t + x.tutar, 0) * 100) / 100;
    const kanallar = Array.from(new Set(satirlar.map((x) => x.kanalAdi).filter(Boolean) as string[]));
    const a: SiparisAktarimAlicisi = {
      anahtar,
      ad: baslikHarfi(satirlar[0].adHam),
      kanallar,
      il: satirlar.find((x) => x.il)?.il,
      siparisSayisi: satirlar.length,
      tutar,
      karar: "kanal",
    };
    if (eslesme) {
      a.adaylar = eslesme.adaylar.map((m) => ({ id: m.id, ad: m.displayName }));
      if (eslesme.adaylar.length === 1) {
        a.karar = "mevcut";
        a.partyId = eslesme.adaylar[0].id;
        a.guven = eslesme.guven;
      } else {
        // Belirsiz eşleşme yeni kart AÇMAZ (aynı eczanenin ikinci kartı
        // olurdu); kullanıcı seçene kadar kanala yazılır.
        a.guven = "belirsiz";
      }
    } else if (satirlar.length >= esik) {
      a.karar = "yeni";
    }
    a.yeniKartAdi = yeniKartAdi(satirlar[0]);

    const elle = d.alicilar?.[anahtar];
    if (elle) {
      a.karar = elle.karar;
      if (elle.karar === "mevcut") {
        if (!elle.partyId || !musteriAdi.has(elle.partyId)) a.karar = "kanal";
        else a.partyId = elle.partyId;
      }
      if (a.karar !== "mevcut") a.partyId = undefined;
      if (elle.ad?.trim()) a.yeniKartAdi = elle.ad.trim().slice(0, 150);
    }
    // Kanalı olmayan tek seferlik alıcının yazılacağı yer yok.
    if (a.karar === "kanal" && kanallar.length === 0) a.karar = "atla";
    if (a.partyId) a.partyAdi = musteriAdi.get(a.partyId);
    alicilar.push(a);
  }
  alicilar.sort((x, y) => KARAR_SIRASI[x.karar] - KARAR_SIRASI[y.karar] || y.siparisSayisi - x.siparisSayisi || x.ad.localeCompare(y.ad, "tr"));

  // ------------------------------------------------ Siparişler
  const kararOf = new Map(alicilar.map((a) => [a.anahtar, a]));
  const tekrar = new Map<string, number>();
  const siparisler: PlanlananSiparis[] = [];
  for (const o of okunan) {
    const a = kararOf.get(o.anahtar)!;
    if (a.karar === "atla") {
      atlanan.push({ satir: o.satir, neden: o.kanalAdi ? NEDEN.aliciAtlandi : NEDEN.kanalYok, ozet: `${o.tarih} · ${o.adHam}` });
      continue;
    }
    const kalemGirdi = o.urunler
      .filter((u) => !alinmayan.has(u.baslik))
      .map((u, sira) => {
        const pid = sutunUrunu.get(u.baslik);
        const urun = pid ? katalogu.get(pid) : undefined;
        return { u, sira, urun, miktar: u.adet, listeBirimFiyat: urun?.liste ?? undefined };
      });
    if (kalemGirdi.length === 0) {
      atlanan.push({ satir: o.satir, neden: NEDEN.urunYok, ozet: `${o.tarih} · ${o.adHam}` });
      continue;
    }
    const pay = kalemleriOrantila(kalemGirdi, o.tutar);
    const kalemler: KalemSatiri[] = pay.map((k) => ({
      product_id: k.urun?.id ?? null,
      aciklama: k.urun ? null : k.u.baslik,
      miktar: k.miktar,
      birim: k.urun?.unit ?? "adet",
      birim_fiyat: k.birimFiyat,
      liste_birim_fiyat: k.urun?.liste ?? null,
      tutar: k.tutar,
      sira: k.sira,
    }));

    const kanal = o.kanalAdi ? kanalOzet.get(o.kanalAdi) : undefined;
    if (kanal) {
      kanal.siparisSayisi += 1;
      kanal.tutar = Math.round((kanal.tutar + o.tutar) * 100) / 100;
    }
    // Aynı gün aynı kişiye aynı ürünler aynı tutarla iki kez gönderilmiş
    // olabilir (gerçekten iki sipariş). Sıra numarası ikisini ayırır;
    // dosya yeniden yüklenince yine aynı sırayla aynı kimlikleri üretir.
    const imza = [ctx.organizationId, o.tarih, sade(o.kanalAdi), o.anahtar, o.tutar, o.urunler.map((u) => `${sade(u.baslik)}:${u.adet}`).join(",")].join("|");
    const n = (tekrar.get(imza) ?? 0) + 1;
    tekrar.set(imza, n);

    siparisler.push({
      satir: o.satir,
      anahtar: o.anahtar,
      kanalAdi: o.kanalAdi,
      siparis: {
        siparis_no: o.siparisNo ?? null,
        siparis_tarihi: o.tarih,
        tutar: o.tutar,
        para_birimi: "TRY",
        vade_gun: kanal?.vadeGun ?? 0,
        odeme_yontemi: kanal?.odemeYontemi ?? "havale",
        alici_adi: baslikHarfi(o.adHam),
        alici_il: o.il ? baslikHarfi(o.il) : null,
        alici_ilce: o.ilce ? baslikHarfi(o.ilce) : null,
        notlar: [o.notlar, ctx.dosyaAdi ? `Excel: ${ctx.dosyaAdi} · satır ${o.satir}` : `Excel satır ${o.satir}`]
          .filter(Boolean)
          .join(" — "),
        organization_id: ctx.organizationId,
        dis_kimlik: createHash("sha1").update(`${imza}|${n}`).digest("hex"),
      },
      kalemler,
    });
  }
  atlanan.sort((x, y) => x.satir - y.satir);

  return {
    dosyaSatiri: rows.length - bi - 1,
    siparisler,
    urunSutunlari,
    kanallar: Array.from(kanalOzet.values()).sort((x, y) => y.siparisSayisi - x.siparisSayisi),
    alicilar,
    atlanan,
    oncekiSatir,
  };
}

const KARAR_SIRASI: Record<AliciKarari, number> = { mevcut: 0, yeni: 1, kanal: 2, atla: 3 };

/**
 * Yeni kartın adı. Eczane belirteci varsa kart eczanenin adını alır, kişi
 * ilgili kişi olur: "İLSU TAN MİHRAPLI ECZ" → "Mihraplı Eczanesi". Eczanenin
 * adı belirteçten önceki SON kelime sayılır — kişi adının kaç kelime olduğu
 * bilinemez, tek kelimelik eczane adı en sık durum; iki kelimelik adı
 * kullanıcı önizlemede düzeltir. Belirteç yoksa kişinin adı.
 */
function yeniKartAdi(o: OkunanSatir): string {
  const ham = o.adHam.replace(/\s+/g, " ").trim().split(" ");
  const b = o.kelimeler.findIndex((x) => ECZANE_BELIRTECI.has(x));
  if (b > 0 && ham.length === o.kelimeler.length) {
    return `${baslikHarfi(ham[b - 1])} Eczanesi`;
  }
  return baslikHarfi(o.adHam);
}

/** Yeni kartın kişisi: belirteçli satırda eczanenin adından önceki kelimeler. */
export function yeniKartKisisi(adHam: string): string | undefined {
  const ham = adHam.replace(/\s+/g, " ").trim().split(" ");
  const k = ham.map(sade);
  const b = k.findIndex((x) => ECZANE_BELIRTECI.has(x));
  if (b > 1 && ham.length === k.length) return baslikHarfi(ham.slice(0, b - 1).join(" "));
  return undefined;
}
