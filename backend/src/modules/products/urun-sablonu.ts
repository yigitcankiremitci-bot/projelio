// ÜRÜN EXCEL ŞABLONU: üretimi ve geri okunması.
//
// Akış müşteri şablonunun aynısı (bkz. party/musteri-sablonu.ts): kullanıcı
// Ürün Yönetimi departmanında şablonu indirir, doldurur ve aynı pencereden geri
// yükler (POST .../products/import); önce önizleme, onayla yazma.
//
// Şablonu üreten ve okuyan kod BİLEREK aynı dosyada: sütun tanımı tek yerde.
// Okuyucu eş adları da tanır — kullanıcı kendi ürün listesini ("Ürün Adı",
// "Stok Kodu", "Satış Fiyatı") getirirse de çalışsın, şablon şart değil.
//
// Burası alanları yalnızca ÇÖZER (etiket → kod, "1.250,50" → 1250.5); asıl
// doğrulama tek tek eklemeyle aynı koddan geçer (ProductsService.buildPatch).
// İkinci bir kural kopyası çıkmasın diye.
//
// Dekoratör YOK: Node'un yerleşik test koşucusu dekoratörlü dosyayı çözemiyor.

import { PRODUCT_UNIT_LABEL, PRODUCT_UNITS, type Locale, type ProductKind, type ProductUnit } from "@projelio/shared";
import { normalizeKey, type SheetData } from "../ai-assistant/ai-sheet-import";
import { Workbook } from "../party/musteri-sablonu";
import type { ProductWriteInput } from "./products.service";

export type UrunAlani =
  | "name"
  | "kind"
  | "category"
  | "brand"
  | "sku"
  | "barcode"
  | "unit"
  | "price"
  | "currency"
  | "costPrice"
  | "taxRate"
  | "stockQuantity"
  | "minStock"
  | "description"
  | "features"
  | "warranty"
  | "leadTime"
  | "productUrl"
  | "notes";

interface Sutun {
  alan: UrunAlani;
  baslik: string;
  en: string;
  /** Kullanıcının kendi listesinde karşılaşılabilecek başlıklar. */
  esAdlar: string[];
  genislik: number;
  aciklama: string;
  aciklamaEn: string;
  ornek: string;
  ornekEn: string;
  zorunlu?: boolean;
  /** Metin biçimi: barkodun ve "00123" gibi stok kodlarının baştaki sıfırı düşmesin. */
  metin?: boolean;
}

const TURLER: { etiket: string; en: string; tur: ProductKind; esAdlar: string[] }[] = [
  { etiket: "Ürün", en: "Product", tur: "product", esAdlar: ["ürün", "urun", "mal", "product", "good", "goods"] },
  { etiket: "Hizmet", en: "Service", tur: "service", esAdlar: ["hizmet", "servis", "service"] },
];

// Birimin İngilizce etiketi; Türkçesi PRODUCT_UNIT_LABEL'da. Okuyucu kodu
// ("kg"), iki dilin etiketini ve aşağıdaki eş adları tanır.
const BIRIM_EN: Record<ProductUnit, string> = {
  adet: "Piece",
  kg: "Kilogram",
  gram: "Gram",
  litre: "Litre",
  metre: "Metre",
  m2: "Square metre",
  m3: "Cubic metre",
  paket: "Pack",
  kutu: "Box",
  saat: "Hour",
  gun: "Day",
  ay: "Month",
};
const BIRIM_ES: Partial<Record<ProductUnit, string[]>> = {
  adet: ["ad", "ad.", "pcs", "pc", "piece", "pieces", "unit", "units", "tane"],
  kg: ["kilo", "kilogram"],
  gram: ["g", "gr"],
  litre: ["l", "lt", "liter", "litre"],
  metre: ["m", "mt", "meter"],
  m2: ["m²", "metrekare"],
  m3: ["m³", "metreküp"],
  paket: ["pk", "pack", "package"],
  kutu: ["box", "koli"],
  saat: ["sa", "hour", "hours", "hr"],
  gun: ["gün", "day", "days"],
  ay: ["month", "months"],
};

// Form yalnızca bu üçünü sunuyor (ProductForm); başka bir birim yazılırsa
// kart açılır ama birim TRY'ye düşer ve uyarı döner.
const PARA_BIRIMLERI: { kod: string; esAdlar: string[] }[] = [
  { kod: "TRY", esAdlar: ["try", "tl", "₺", "türk lirası", "turk lirasi", "lira"] },
  { kod: "USD", esAdlar: ["usd", "$", "dolar", "dollar", "us$"] },
  { kod: "EUR", esAdlar: ["eur", "€", "euro", "avro"] },
];

export const URUN_SUTUNLARI: Sutun[] = [
  {
    alan: "name",
    baslik: "Ad",
    en: "Name",
    esAdlar: ["ad", "adı", "ürün", "ürün adı", "urun adi", "hizmet", "hizmet adı", "ürün/hizmet", "isim", "product", "product name", "title"],
    genislik: 30,
    aciklama: "Zorunlu. Ürünün ya da hizmetin adı.",
    aciklamaEn: "Required. Name of the product or service.",
    ornek: "Çelik termos 500 ml",
    ornekEn: "Steel flask 500 ml",
    zorunlu: true,
  },
  {
    alan: "kind",
    baslik: "Tür",
    en: "Type",
    esAdlar: ["tür", "tip", "type", "kind"],
    genislik: 12,
    aciklama: "Ürün ya da Hizmet. Boşsa Ürün sayılır.",
    aciklamaEn: "Product or Service. Blank counts as Product.",
    ornek: "Ürün",
    ornekEn: "Product",
  },
  {
    alan: "category",
    baslik: "Kategori",
    en: "Category",
    esAdlar: ["kategori", "grup", "ürün grubu", "category", "group"],
    genislik: 18,
    aciklama: "",
    aciklamaEn: "",
    ornek: "Mutfak",
    ornekEn: "Kitchen",
  },
  {
    alan: "brand",
    baslik: "Marka",
    en: "Brand",
    esAdlar: ["marka", "brand", "üretici", "manufacturer"],
    genislik: 16,
    aciklama: "",
    aciklamaEn: "",
    ornek: "Projelio",
    ornekEn: "Projelio",
  },
  {
    alan: "sku",
    baslik: "Stok kodu",
    en: "SKU",
    esAdlar: ["stok kodu", "ürün kodu", "urun kodu", "kod", "sku", "model kodu", "product code", "item code", "code"],
    genislik: 16,
    aciklama: "Şirkette tekil olmalı. Aynı stok koduyla kayıtlı ürün varsa satır atlanır.",
    aciklamaEn: "Must be unique in the company. Rows whose SKU is already registered are skipped.",
    ornek: "TRM-500",
    ornekEn: "FLS-500",
    metin: true,
  },
  {
    alan: "barcode",
    baslik: "Barkod",
    en: "Barcode",
    esAdlar: ["barkod", "barcode", "ean", "gtin", "upc"],
    genislik: 16,
    aciklama: "",
    aciklamaEn: "",
    ornek: "8690000000017",
    ornekEn: "8690000000017",
    metin: true,
  },
  {
    alan: "unit",
    baslik: "Birim",
    en: "Unit",
    esAdlar: ["birim", "ölçü birimi", "olcu birimi", "unit", "uom"],
    genislik: 12,
    aciklama: "Adet, Kilogram, Litre, Saat… (listeden seçin).",
    aciklamaEn: "Piece, Kilogram, Litre, Hour… (pick from the list).",
    ornek: "Adet",
    ornekEn: "Piece",
  },
  {
    alan: "price",
    baslik: "Fiyat",
    en: "Price",
    esAdlar: ["fiyat", "satış fiyatı", "satis fiyati", "birim fiyat", "liste fiyatı", "price", "sale price", "unit price"],
    genislik: 12,
    aciklama: "Satış fiyatı, KDV hariç.",
    aciklamaEn: "Sale price, excluding VAT.",
    ornek: "450",
    ornekEn: "450",
  },
  {
    alan: "currency",
    baslik: "Para birimi",
    en: "Currency",
    esAdlar: ["para birimi", "döviz", "doviz", "currency"],
    genislik: 12,
    aciklama: "TRY, USD ya da EUR. Boşsa TRY.",
    aciklamaEn: "TRY, USD or EUR. Blank means TRY.",
    ornek: "TRY",
    ornekEn: "TRY",
  },
  {
    alan: "costPrice",
    baslik: "Maliyet",
    en: "Cost",
    esAdlar: ["maliyet", "alış fiyatı", "alis fiyati", "geliş fiyatı", "cost", "cost price", "purchase price"],
    genislik: 12,
    aciklama: "",
    aciklamaEn: "",
    ornek: "280",
    ornekEn: "280",
  },
  {
    alan: "taxRate",
    baslik: "KDV (%)",
    en: "VAT (%)",
    esAdlar: ["kdv", "kdv oranı", "kdv orani", "vergi", "vat", "tax", "tax rate"],
    genislik: 10,
    aciklama: "0 ile 100 arası.",
    aciklamaEn: "Between 0 and 100.",
    ornek: "20",
    ornekEn: "20",
  },
  {
    alan: "stockQuantity",
    baslik: "Stok",
    en: "Stock",
    esAdlar: ["stok", "stok miktarı", "stok miktari", "miktar", "adet", "mevcut", "stock", "quantity", "qty"],
    genislik: 10,
    aciklama: "",
    aciklamaEn: "",
    ornek: "120",
    ornekEn: "120",
  },
  {
    alan: "minStock",
    baslik: "Kritik stok",
    en: "Minimum stock",
    esAdlar: ["kritik stok", "minimum stok", "min stok", "min stock", "reorder level"],
    genislik: 12,
    aciklama: "Stok bu sayının altına düşünce kartta uyarı çıkar.",
    aciklamaEn: "The card warns when stock drops below this number.",
    ornek: "20",
    ornekEn: "20",
  },
  {
    alan: "description",
    baslik: "Açıklama",
    en: "Description",
    esAdlar: ["açıklama", "aciklama", "tanım", "tanim", "description"],
    genislik: 40,
    aciklama: "",
    aciklamaEn: "",
    ornek: "Paslanmaz çelik, 12 saat sıcak tutar.",
    ornekEn: "Stainless steel, keeps hot for 12 hours.",
  },
  {
    alan: "features",
    baslik: "Öne çıkan özellikler",
    en: "Key features",
    esAdlar: ["öne çıkan özellikler", "özellikler", "ozellikler", "features", "key features"],
    genislik: 36,
    aciklama: "Birden fazlaysa noktalı virgülle ayırın.",
    aciklamaEn: "Separate several with semicolons.",
    ornek: "Sızdırmaz kapak; BPA içermez",
    ornekEn: "Leak-proof lid; BPA free",
  },
  {
    alan: "warranty",
    baslik: "Garanti",
    en: "Warranty",
    esAdlar: ["garanti", "garanti süresi", "warranty"],
    genislik: 12,
    aciklama: "",
    aciklamaEn: "",
    ornek: "2 yıl",
    ornekEn: "2 years",
  },
  {
    alan: "leadTime",
    baslik: "Teslim süresi",
    en: "Lead time",
    esAdlar: ["teslim süresi", "teslim suresi", "tedarik süresi", "teslimat", "lead time", "delivery time"],
    genislik: 14,
    aciklama: "",
    aciklamaEn: "",
    ornek: "3 iş günü",
    ornekEn: "3 business days",
  },
  {
    alan: "productUrl",
    baslik: "Ürün adresi",
    en: "Product URL",
    esAdlar: ["ürün adresi", "urun adresi", "web adresi", "link", "bağlantı", "url", "product url", "website"],
    genislik: 28,
    aciklama: "Ürünün web sitesindeki sayfası.",
    aciklamaEn: "The product's page on your website.",
    ornek: "https://ornek.com/termos",
    ornekEn: "https://example.com/flask",
  },
  {
    alan: "notes",
    baslik: "Notlar",
    en: "Notes",
    esAdlar: ["not", "notlar", "notes", "note"],
    genislik: 28,
    aciklama: "",
    aciklamaEn: "",
    ornek: "",
    ornekEn: "",
  },
];

const METIN = {
  tr: {
    veriSayfasi: "Ürünler",
    rehberSayfasi: "Nasıl doldurulur",
    dosya: "Projelio ürün şablonu.xlsx",
    baslik: "Projelio ürün şablonu",
    sutun: "Sütun",
    aciklama: "Açıklama",
    ornek: "Örnek",
    istegeBagli: "İsteğe bağlı.",
    yukleme: "Yükleme",
    yuklemeMetni:
      `"Ürünler" sayfasını doldurup dosyayı Ürün/Hizmet bölümündeki "Excel ile toplu ekle" penceresinden ` +
      "yükleyin. Önce kaç ürün açılacağı gösterilir, onayınızdan sonra yazılır. Aynı stok koduyla, barkodla " +
      "ya da (stok kodu yoksa) aynı adla kayıtlı olanlar atlanır. Fotoğraflar sonradan ürün kartından eklenir. " +
      "Sütunların sırası ve bu sayfa önemli değil; başlıkları değiştirmeyin.",
  },
  en: {
    veriSayfasi: "Products",
    rehberSayfasi: "How to fill in",
    dosya: "Projelio product template.xlsx",
    baslik: "Projelio product template",
    sutun: "Column",
    aciklama: "Description",
    ornek: "Example",
    istegeBagli: "Optional.",
    yukleme: "Uploading",
    yuklemeMetni:
      `Fill in the "Products" sheet and upload the file from "Bulk add from Excel" in the Products/Services ` +
      "section. You'll first see how many products will be created; they're written only after you confirm. " +
      "Rows already registered with the same SKU, barcode or (without a SKU) the same name are skipped. Photos " +
      "are added later from the product card. Column order and this sheet don't matter; don't change the headings.",
  },
} satisfies Record<Locale, Record<string, string>>;

export function urunSablonDosyaAdi(dil: Locale): string {
  return METIN[dil].dosya;
}

/** Şablonun kaç satırına açılır liste ve metin biçimi uygulanacağı. */
const SABLON_SATIR = 1000;

// ============================================================ Üretim

/**
 * Boş şablon. Örnek satır veri sayfasında DEĞİL, "Nasıl doldurulur"
 * sayfasında: silinmeyi unutulursa sahte bir "Çelik termos" açılırdı.
 */
export async function urunSablonuOlustur(dil: Locale = "tr"): Promise<Buffer> {
  const m = METIN[dil];
  const en = dil === "en";
  const secenekler = (s: Sutun): string[] | undefined =>
    s.alan === "kind"
      ? TURLER.map((t) => (en ? t.en : t.etiket))
      : s.alan === "unit"
        ? PRODUCT_UNITS.map((u) => (en ? BIRIM_EN[u] : PRODUCT_UNIT_LABEL[u]))
        : s.alan === "currency"
          ? PARA_BIRIMLERI.map((p) => p.kod)
          : undefined;

  const wb = new Workbook();
  wb.creator = "Projelio";
  wb.title = m.baslik;

  const veri = wb.addWorksheet(m.veriSayfasi, { views: [{ state: "frozen", ySplit: 1 }] });
  veri.columns = URUN_SUTUNLARI.map((s) => ({ header: en ? s.en : s.baslik, key: s.alan, width: s.genislik }));
  const baslik = veri.getRow(1);
  baslik.font = { bold: true, color: { argb: "FFFFFFFF" } };
  baslik.height = 20;
  URUN_SUTUNLARI.forEach((s, i) => {
    const hucre = baslik.getCell(i + 1);
    // Paletin ana ve vurgu renkleri (packages/shared/src/theme.ts): zorunlu sütun vurgu renginde.
    hucre.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.zorunlu ? "FFC0813F" : "FF3E4858" } };
    const aciklama = en ? s.aciklamaEn : s.aciklama;
    if (aciklama) hucre.note = aciklama;
    const harf = veri.getColumn(i + 1).letter;
    if (s.metin) {
      for (let r = 2; r <= SABLON_SATIR; r++) veri.getCell(`${harf}${r}`).numFmt = "@";
    }
    const liste = secenekler(s);
    if (liste) {
      for (let r = 2; r <= SABLON_SATIR; r++) {
        veri.getCell(`${harf}${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          // Liste yalnızca öneri: okuyucu eş adları da tanıyor ("kg", "TL").
          showErrorMessage: false,
          formulae: [`"${liste.join(",")}"`],
        };
      }
    }
  });

  const rehber = wb.addWorksheet(m.rehberSayfasi);
  rehber.columns = [
    { header: m.sutun, key: "sutun", width: 22 },
    { header: m.aciklama, key: "aciklama", width: 70 },
    { header: m.ornek, key: "ornek", width: 34 },
  ];
  rehber.getRow(1).font = { bold: true };
  for (const s of URUN_SUTUNLARI) {
    rehber.addRow({
      sutun: en ? s.en : s.baslik,
      aciklama: (en ? s.aciklamaEn : s.aciklama) || m.istegeBagli,
      ornek: en ? s.ornekEn : s.ornek,
    });
  }
  rehber.addRow({});
  rehber.addRow({ sutun: m.yukleme, aciklama: m.yuklemeMetni });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ============================================================ Okuma

/** Ürünlerin okunacağı sayfa: şablonun veri sayfası varsa o, yoksa ilk sayfa. */
export function urunSayfasiniSec(sayfalar: SheetData[]): SheetData | undefined {
  const veriAdlari = [METIN.tr.veriSayfasi, METIN.en.veriSayfasi].map(normalizeKey);
  return sayfalar.find((s) => veriAdlari.includes(normalizeKey(s.name))) ?? sayfalar[0];
}

/** Başlık için sadeleştirme: yıldız ve iki nokta atılır. Parantez KALIR — "KDV (%)" şablonun kendi başlığı. */
function baslikAnahtari(value: unknown): string {
  return normalizeKey(String(value ?? "").replace(/\*/g, "").replace(/:$/, ""));
}

/**
 * Hangi alanın hangi sütundan okunacağı. Yalnızca BİREBİR başlık eşleşmesi:
 * bulanık "içerir" eşleşmesi "Stok kodu" sütununu "Stok" alanına da
 * düşürürdü ve ürün kodu stok miktarı diye okunurdu.
 */
export function urunSutunlariniBul(basliklar: string[]): Map<UrunAlani, number> {
  const anahtarlar = basliklar.map(baslikAnahtari);
  const sonuc = new Map<UrunAlani, number>();
  const kullanilan = new Set<number>();
  for (const s of URUN_SUTUNLARI) {
    const adaylar = [s.baslik, s.en, ...s.esAdlar].map(baslikAnahtari);
    // Parantezsiz yazımı da tanı: "KDV" ↔ "KDV (%)".
    const parantezsiz = (a: string) => normalizeKey(a.replace(/\([^)]*\)/g, ""));
    const i = anahtarlar.findIndex(
      (a, idx) => !kullanilan.has(idx) && (adaylar.includes(a) || adaylar.includes(parantezsiz(a)))
    );
    if (i >= 0) {
      sonuc.set(s.alan, i);
      kullanilan.add(i);
    }
  }
  return sonuc;
}

/**
 * "1.250,50", "1,250.50", "₺450", "%20", "450 TL" → sayı.
 *
 * Excel'in sayı hücresi cellText'ten JS biçiminde gelir ("1250.5", "2.125").
 * İki ayırıcı birden varsa sondaki ondalıktır ("1.250,50" / "1,250.50").
 * Tek ayırıcı tek kez geçiyorsa ONDALIK sayılır: "2.125" sayı hücresinden
 * geliyor olabilir ve 2125'e çevirmek fiyatı bin katına çıkarırdı; "1.250"
 * yazmak isteyen Türkçe Excel zaten 1250 sayısını kaydeder. Aynı ayırıcı
 * birden çok geçiyorsa ("1.250.000") binliktir. Okunamazsa undefined.
 */
export function sayiCoz(deger: string): number | undefined {
  let s = deger.replace(/[\s₺$€%]|tl|try|usd|eur/gi, "");
  if (!s) return undefined;
  const sonNokta = s.lastIndexOf(".");
  const sonVirgul = s.lastIndexOf(",");
  if (sonNokta >= 0 && sonVirgul >= 0) {
    const ondalik = sonNokta > sonVirgul ? "." : ",";
    const binlik = ondalik === "." ? "," : ".";
    s = s.split(binlik).join("").replace(ondalik, ".");
  } else if (sonNokta >= 0 || sonVirgul >= 0) {
    const ayirici = sonNokta >= 0 ? "." : ",";
    const parcalar = s.split(ayirici);
    s = parcalar.length > 2 ? parcalar.join("") : parcalar.join(".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function turuCoz(deger: string): ProductKind | undefined {
  const d = normalizeKey(deger);
  return TURLER.find((t) => normalizeKey(t.etiket) === d || normalizeKey(t.en) === d || t.esAdlar.includes(d))?.tur;
}

function birimiCoz(deger: string): ProductUnit | undefined {
  const d = normalizeKey(deger);
  return PRODUCT_UNITS.find(
    (u) =>
      u === d ||
      normalizeKey(PRODUCT_UNIT_LABEL[u]) === d ||
      normalizeKey(BIRIM_EN[u]) === d ||
      (BIRIM_ES[u] ?? []).includes(d)
  );
}

function paraBiriminiCoz(deger: string): string | undefined {
  const d = normalizeKey(deger);
  return PARA_BIRIMLERI.find((p) => p.esAdlar.includes(d))?.kod;
}

export interface PlanlananUrun {
  satir: number;
  urun: ProductWriteInput & { name: string };
}

export interface UrunPlani {
  toplamSatir: number;
  planlanan: PlanlananUrun[];
  atlanan: { satir: number; sebep: string }[];
  uyarilar: { satir: number; sebep: string }[];
  eslesenSutunlar: Record<string, string>;
  kullanilmayanSutunlar: string[];
}

/**
 * Tabloyu ürün listesine çevirir. Hiçbir şey YAZMAZ.
 *
 * Adı boş satır atlanır. Tanınmayan tür/birim/para birimi ya da okunamayan
 * sayı satırı atlatmaz: ürün açılır, o alan boş (ya da varsayılan) kalır ve
 * UYARI döner — "Adet" yerine "Adt" yazıldı diye ürün kaybolmamalı.
 */
export function planUrunImport(sheet: SheetData): UrunPlani {
  const basliklar = (sheet.rows[0] ?? []).map((h) => String(h ?? ""));
  const sutunlar = urunSutunlariniBul(basliklar);

  const eslesenSutunlar: Record<string, string> = {};
  for (const [alan, i] of sutunlar) eslesenSutunlar[alan] = basliklar[i];
  const kullanilanlar = new Set(sutunlar.values());
  const kullanilmayanSutunlar = basliklar.filter((h, i) => h.trim() && !kullanilanlar.has(i));

  const planlanan: PlanlananUrun[] = [];
  const atlanan: { satir: number; sebep: string }[] = [];
  const uyarilar: { satir: number; sebep: string }[] = [];

  if (!sutunlar.has("name")) {
    return {
      toplamSatir: 0,
      planlanan,
      atlanan: [{ satir: 1, sebep: "Ad sütunu bulunamadı (başlığı \"Ad\" ya da \"Ürün adı\" olmalı)" }],
      uyarilar,
      eslesenSutunlar,
      kullanilmayanSutunlar,
    };
  }

  let toplamSatir = 0;
  for (let satirNo = 2; satirNo <= sheet.rows.length; satirNo++) {
    const row = sheet.rows[satirNo - 1] ?? [];
    if (row.every((c) => !String(c ?? "").trim())) continue;
    toplamSatir++;
    const al = (alan: UrunAlani): string | undefined => {
      const i = sutunlar.get(alan);
      const v = i === undefined ? "" : String(row[i] ?? "").trim();
      return v || undefined;
    };

    const ad = al("name");
    if (!ad) {
      atlanan.push({ satir: satirNo, sebep: "ad boş" });
      continue;
    }
    const urun: PlanlananUrun["urun"] = { name: ad };

    const tur = al("kind");
    if (tur) {
      const cozulen = turuCoz(tur);
      if (cozulen) urun.kind = cozulen;
      else uyarilar.push({ satir: satirNo, sebep: `"${tur}" türü tanınmadı, Ürün sayıldı` });
    }
    const birim = al("unit");
    if (birim) {
      const cozulen = birimiCoz(birim);
      if (cozulen) urun.unit = cozulen;
      else uyarilar.push({ satir: satirNo, sebep: `"${birim}" birimi tanınmadı, boş bırakıldı` });
    }
    const para = al("currency");
    if (para) {
      const cozulen = paraBiriminiCoz(para);
      if (cozulen) urun.currency = cozulen;
      else uyarilar.push({ satir: satirNo, sebep: `"${para}" para birimi tanınmadı, TRY sayıldı` });
    }

    const sayilar: [UrunAlani & keyof ProductWriteInput, string][] = [
      ["price", "fiyat"],
      ["costPrice", "maliyet"],
      ["taxRate", "KDV"],
      ["stockQuantity", "stok"],
      ["minStock", "kritik stok"],
    ];
    for (const [alan, etiket] of sayilar) {
      const ham = al(alan);
      if (!ham) continue;
      const n = sayiCoz(ham);
      if (n === undefined) uyarilar.push({ satir: satirNo, sebep: `"${ham}" ${etiket} olarak okunamadı, boş bırakıldı` });
      // KDV "0,2" yazılmışsa (Excel'in yüzde hücresi 0.2 verir) %20 demektir.
      else (urun as any)[alan] = alan === "taxRate" && n > 0 && n < 1 ? Math.round(n * 10000) / 100 : n;
    }

    for (const alan of ["category", "brand", "sku", "barcode", "description", "warranty", "leadTime", "productUrl", "notes"] as const) {
      const v = al(alan);
      if (v) urun[alan] = v;
    }
    const ozellikler = al("features");
    if (ozellikler) urun.features = ozellikler.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);

    planlanan.push({ satir: satirNo, urun });
  }

  return { toplamSatir, planlanan, atlanan, uyarilar, eslesenSutunlar, kullanilmayanSutunlar };
}

/**
 * Zaten kayıtlı olanları ve dosyanın kendi içindeki tekrarları ayıklar.
 *
 * Stok kodu ve barkod kesin kimliktir. Ad ancak satırda stok kodu YOKSA
 * karşılaştırılır: aynı adı taşıyan farklı kodlu varyantlar ("Tişört" S/M/L)
 * gerçek ve ayrı ürünlerdir, ama kodsuz bir listeyi iki kez yüklemek her
 * ürünü ikiye katlamamalı. Stok kodu veritabanında tekil (arşiv dahil) —
 * `mevcut` arşivdekileri de içermeli, yoksa toplu yazma o satırda patlardı.
 */
export function mevcutUrunleriAyikla(
  planlanan: PlanlananUrun[],
  mevcut: { name: string; sku?: string; barcode?: string; archivedAt?: string }[]
): { yeni: PlanlananUrun[]; zatenVar: { satir: number; ad: string; mevcutKart: string; neden: string }[] } {
  const kod = new Map<string, string>();
  const barkod = new Map<string, string>();
  const ad = new Map<string, string>();
  const anahtar = (s: string) => s.trim().toLocaleLowerCase("tr");
  // Müşterilerin normalizeName'i BİLEREK kullanılmıyor: o noktayı silip
  // "Ltd." gibi ekleri atıyor; ürün adında "1.5 L" ile "15 L" çakışırdı.
  const adAnahtari = (s: string) => normalizeKey(s);
  const ekle = (u: { name: string; sku?: string | null; barcode?: string | null }, etiket: string) => {
    if (u.sku?.trim()) kod.set(anahtar(u.sku), etiket);
    if (u.barcode?.trim()) barkod.set(anahtar(u.barcode), etiket);
    const n = adAnahtari(u.name);
    if (n) ad.set(n, etiket);
  };
  for (const m of mevcut) ekle(m, m.archivedAt ? `${m.name} (arşivde)` : m.name);

  const yeni: PlanlananUrun[] = [];
  const zatenVar: { satir: number; ad: string; mevcutKart: string; neden: string }[] = [];
  for (const p of planlanan) {
    const k = p.urun.sku?.trim() ? kod.get(anahtar(p.urun.sku)) : undefined;
    const b = p.urun.barcode?.trim() ? barkod.get(anahtar(p.urun.barcode)) : undefined;
    const a = p.urun.sku?.trim() ? undefined : ad.get(adAnahtari(p.urun.name));
    const eslesen = k ?? b ?? a;
    if (eslesen) {
      zatenVar.push({
        satir: p.satir,
        ad: p.urun.name,
        mevcutKart: eslesen,
        // Arayüz bu üç değeri tanıyıp çeviriyor (UrunExcelModal NEDEN).
        neden: k ? "aynı stok kodu" : b ? "aynı barkod" : "aynı ad",
      });
      continue;
    }
    yeni.push(p);
    ekle(p.urun, `${p.urun.name} (dosyada ${p.satir}. satır)`);
  }
  return { yeni, zatenVar };
}
