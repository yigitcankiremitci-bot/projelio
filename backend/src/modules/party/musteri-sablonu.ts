// MÜŞTERİ EXCEL ŞABLONU: üretimi ve geri okunması.
//
// Akış: kullanıcı Müşteriler ekranından şablonu indirir, doldurur ve AYNI
// pencereden geri yükler (POST .../party/import); önce önizleme, onayla yazma.
// Lio da aynı yoldan geçer (import_customers_from_sheet) — iki kapı, tek kod:
// PartyService.sablondanIceAktar.
//
// Şablonu üreten ve okuyan kod BİLEREK aynı dosyada: sütun tanımı tek yerde.
// Başlığı burada değiştirip okuyucuyu unutmak, indirilen şablonların sessizce
// eşleşmemesi demekti. Okuyucu eş adları da tanır — kullanıcı kendi listesini
// ("Firma Adı", "Tel", "Email") getirirse de çalışsın, şablon şart değil.
//
// Dekoratör YOK: Node'un yerleşik test koşucusu dekoratörlü dosyayı çözemiyor
// (bkz. ai-assistant/ai-sheet-import.ts ile aynı ayrım).

import * as ExcelJS from "exceljs";
import type { Party, PartyRole, PartyType } from "@projelio/shared";
import { BadRequestException } from "@nestjs/common";
import {
  cellText,
  MAX_RETAINED_ROWS,
  normalizeKey,
  parseCsv,
  resolveColumn,
  type SheetData,
} from "../ai-assistant/ai-sheet-import";
import { normalizeEmail, normalizeName, normalizeTaxNumber } from "./party-dedup";

// Derlenmiş sunucu (CommonJS) paketi doğrudan veriyor; Node'un test koşucusu
// ise ESM olarak yüklüyor ve CommonJS paketi `default` altına koyuyor. İkisinde
// de çalışsın diye sınıf buradan alınıyor — şablonu test gerçekten üretebilsin.
export const Workbook: typeof ExcelJS.Workbook = (ExcelJS as any).Workbook ?? (ExcelJS as any).default.Workbook;

export type MusteriAlani =
  | "displayName"
  | "partyType"
  | "roles"
  | "legalName"
  | "taxNumber"
  | "taxOffice"
  | "email"
  | "phone"
  | "website"
  | "city"
  | "district"
  | "address"
  | "contactName"
  | "contactPhone"
  | "contactEmail"
  | "notes";

interface Sutun {
  alan: MusteriAlani;
  baslik: string;
  /** Kullanıcının kendi listesinde karşılaşılabilecek başlıklar (normalize edilmiş). */
  esAdlar: string[];
  genislik: number;
  aciklama: string;
  ornek: string;
  secenekler?: string[];
  zorunlu?: boolean;
  /** Metin biçimi: "0532…" ve "0123456789" gibi değerlerin baştaki sıfırı düşmesin. */
  metin?: boolean;
}

const ROLLER: { etiket: string; rol: PartyRole; esAdlar: string[] }[] = [
  { etiket: "Müşteri", rol: "customer", esAdlar: ["müşteri", "musteri", "customer", "client"] },
  { etiket: "Aday müşteri", rol: "lead", esAdlar: ["aday müşteri", "aday", "potansiyel", "lead"] },
  { etiket: "Tedarikçi", rol: "supplier", esAdlar: ["tedarikçi", "tedarikci", "supplier", "vendor"] },
  { etiket: "Distribütör", rol: "distributor", esAdlar: ["distribütör", "distributor", "bayi", "dealer"] },
  { etiket: "Diğer", rol: "other", esAdlar: ["diğer", "diger", "other"] },
];

const TURLER: { etiket: string; tur: PartyType; esAdlar: string[] }[] = [
  { etiket: "Firma", tur: "company", esAdlar: ["firma", "şirket", "sirket", "kurum", "tüzel", "company"] },
  { etiket: "Kişi", tur: "person", esAdlar: ["kişi", "kisi", "şahıs", "sahis", "bireysel", "gerçek", "person", "individual"] },
];

export const MUSTERI_SUTUNLARI: Sutun[] = [
  {
    alan: "displayName",
    baslik: "Ad",
    esAdlar: ["ad", "adı", "müşteri", "müşteri adı", "firma", "firma adı", "ad soyad", "adı soyadı", "name", "company", "customer"],
    genislik: 28,
    aciklama: "Zorunlu. Listede görünecek ad: firma adı ya da kişinin adı soyadı.",
    ornek: "Deniz Lojistik",
    zorunlu: true,
  },
  {
    alan: "partyType",
    baslik: "Tür",
    esAdlar: ["tür", "tip", "type"],
    genislik: 10,
    aciklama: "Firma ya da Kişi. Boşsa Firma sayılır.",
    ornek: "Firma",
    secenekler: TURLER.map((t) => t.etiket),
  },
  {
    alan: "roles",
    baslik: "Rol",
    esAdlar: ["rol", "roller", "role", "kategori", "grup"],
    genislik: 16,
    aciklama: "Müşteri, Aday müşteri, Tedarikçi, Distribütör ya da Diğer. Birden fazlaysa virgülle ayırın. Boşsa Aday müşteri.",
    ornek: "Müşteri",
    secenekler: ROLLER.map((r) => r.etiket),
  },
  {
    alan: "legalName",
    baslik: "Resmî unvan",
    esAdlar: ["resmî unvan", "resmi unvan", "unvan", "ticari unvan", "legal name"],
    genislik: 32,
    aciklama: "Faturada yazan tam unvan.",
    ornek: "Deniz Lojistik Taşımacılık Ltd. Şti.",
  },
  {
    alan: "taxNumber",
    baslik: "Vergi / TC no",
    esAdlar: ["vergi / tc no", "vergi no", "vergi numarası", "vkn", "tckn", "tc no", "tc kimlik no", "tax number", "tax id"],
    genislik: 16,
    aciklama: "Vergi numarası ya da TC kimlik numarası. Aynı numara iki kez girilemez.",
    ornek: "1234567890",
    metin: true,
  },
  {
    alan: "taxOffice",
    baslik: "Vergi dairesi",
    esAdlar: ["vergi dairesi", "vd", "tax office"],
    genislik: 16,
    aciklama: "",
    ornek: "Kadıköy",
  },
  {
    alan: "email",
    baslik: "E-posta",
    esAdlar: ["e-posta", "eposta", "e posta", "mail", "email", "e-mail"],
    genislik: 26,
    aciklama: "",
    ornek: "info@denizlojistik.com",
  },
  {
    alan: "phone",
    baslik: "Telefon",
    esAdlar: ["telefon", "tel", "telefon no", "cep", "gsm", "phone", "mobile"],
    genislik: 16,
    aciklama: "",
    ornek: "0216 555 12 34",
    metin: true,
  },
  {
    alan: "website",
    baslik: "Web sitesi",
    esAdlar: ["web sitesi", "web", "site", "website", "internet sitesi"],
    genislik: 22,
    aciklama: "",
    ornek: "denizlojistik.com",
  },
  { alan: "city", baslik: "Şehir", esAdlar: ["şehir", "il", "city"], genislik: 12, aciklama: "", ornek: "İstanbul" },
  { alan: "district", baslik: "İlçe", esAdlar: ["ilçe", "district"], genislik: 12, aciklama: "", ornek: "Kadıköy" },
  {
    alan: "address",
    baslik: "Adres",
    esAdlar: ["adres", "açık adres", "address"],
    genislik: 32,
    aciklama: "",
    ornek: "Caferağa Mah. Moda Cad. No: 1",
  },
  {
    alan: "contactName",
    baslik: "Yetkili kişi",
    esAdlar: ["yetkili kişi", "yetkili", "ilgili kişi", "irtibat kişisi", "contact", "contact name"],
    genislik: 20,
    aciklama: "Firmadaki muhatabınız. Kartın Kişiler sekmesine birincil kişi olarak eklenir.",
    ornek: "Ayşe Yılmaz",
  },
  {
    alan: "contactPhone",
    baslik: "Yetkili telefon",
    esAdlar: ["yetkili telefon", "yetkili tel", "contact phone"],
    genislik: 16,
    aciklama: "",
    ornek: "0532 555 12 34",
    metin: true,
  },
  {
    alan: "contactEmail",
    baslik: "Yetkili e-posta",
    esAdlar: ["yetkili e-posta", "yetkili eposta", "yetkili mail", "contact email"],
    genislik: 24,
    aciklama: "",
    ornek: "ayse@denizlojistik.com",
  },
  {
    alan: "notes",
    baslik: "Not",
    esAdlar: ["not", "notlar", "açıklama", "aciklama", "notes", "note"],
    genislik: 32,
    aciklama: "Serbest not.",
    ornek: "Aylık sevkiyat anlaşması var.",
  },
];

export const SABLON_SAYFA_ADI = "Müşteriler";
export const SABLON_DOSYA_ADI = "Projelio müşteri şablonu.xlsx";
/** Şablonun kaç satırına açılır liste ve metin biçimi uygulanacağı. */
const SABLON_SATIR = 1000;

// ============================================================ Üretim

/**
 * Boş şablon.
 *
 * Örnek satır VERİ sayfasına konmuyor, "Nasıl doldurulur" sayfasında duruyor:
 * kullanıcı silmeyi unutursa "Deniz Lojistik" adında sahte bir müşteri açılırdı.
 * Veri sayfası İLK sayfa — Lio sayfa adı verilmezse ilk sayfayı okur.
 */
export async function musteriSablonuOlustur(): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = "Projelio";
  wb.title = "Projelio müşteri şablonu";

  const veri = wb.addWorksheet(SABLON_SAYFA_ADI, { views: [{ state: "frozen", ySplit: 1 }] });
  veri.columns = MUSTERI_SUTUNLARI.map((s) => ({ header: s.baslik, key: s.alan, width: s.genislik }));
  const baslik = veri.getRow(1);
  baslik.font = { bold: true, color: { argb: "FFFFFFFF" } };
  baslik.height = 20;
  MUSTERI_SUTUNLARI.forEach((s, i) => {
    const hucre = baslik.getCell(i + 1);
    // Paletin ana ve vurgu renkleri (packages/shared/src/theme.ts): zorunlu sütun vurgu renginde.
    hucre.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.zorunlu ? "FFC0813F" : "FF3E4858" } };
    if (s.aciklama) hucre.note = s.aciklama;
    const harf = veri.getColumn(i + 1).letter;
    if (s.metin) {
      for (let r = 2; r <= SABLON_SATIR; r++) veri.getCell(`${harf}${r}`).numFmt = "@";
    }
    if (s.secenekler) {
      for (let r = 2; r <= SABLON_SATIR; r++) {
        veri.getCell(`${harf}${r}`).dataValidation = {
          type: "list",
          // Rol birden fazla olabilir ("Müşteri, Tedarikçi"): liste yalnızca
          // öneri, başka değer yazılınca Excel engellemesin.
          allowBlank: true,
          showErrorMessage: false,
          formulae: [`"${s.secenekler.join(",")}"`],
        };
      }
    }
  });

  const rehber = wb.addWorksheet("Nasıl doldurulur");
  rehber.columns = [
    { header: "Sütun", key: "sutun", width: 18 },
    { header: "Açıklama", key: "aciklama", width: 70 },
    { header: "Örnek", key: "ornek", width: 34 },
  ];
  rehber.getRow(1).font = { bold: true };
  for (const s of MUSTERI_SUTUNLARI) {
    rehber.addRow({ sutun: s.baslik, aciklama: s.aciklama || "İsteğe bağlı.", ornek: s.ornek });
  }
  rehber.addRow({});
  rehber.addRow({
    sutun: "Yükleme",
    aciklama:
      `"${SABLON_SAYFA_ADI}" sayfasını doldurup dosyayı Müşteriler ekranındaki "Excel ile toplu ekle" ` +
      "penceresinden yükleyin (ya da Lio'ya verin). Önce kaç kart açılacağı gösterilir, onayınızdan sonra " +
      "yazılır. Aynı adla, vergi numarasıyla ya da e-postayla " +
      "zaten kayıtlı olanlar atlanır. Sütunların sırası ve bu sayfa önemli değil; başlıkları değiştirmeyin.",
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ============================================================ Okuma

/**
 * Yüklenen dosyanın sayfaları (.xlsx ya da .csv).
 *
 * Eski .xls bilerek reddediliyor: ExcelJS okuyamıyor ve sessizce boş dönmesi,
 * "dosyada müşteri yok" diye yanlış bir sonuç verirdi.
 */
export async function tabloyuOku(buffer: Buffer, dosyaAdi: string): Promise<SheetData[]> {
  const ad = dosyaAdi.toLocaleLowerCase("tr");
  if (ad.endsWith(".csv")) {
    const rows = parseCsv(buffer.toString("utf8"));
    return rows.length ? [{ name: SABLON_SAYFA_ADI, rows: rows.slice(0, MAX_RETAINED_ROWS) }] : [];
  }
  if (ad.endsWith(".xls")) {
    throw new BadRequestException("Eski Excel biçimi (.xls) okunamıyor. Dosyayı .xlsx olarak kaydedip tekrar yükleyin.");
  }
  const wb = new Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch {
    // ExcelJS bozuk dosyada anlamsız bir TypeError atıyor (bkz. ai-attachments).
    throw new BadRequestException("Dosya Excel (.xlsx) olarak açılamadı. Excel'de açıp yeniden kaydedip deneyin.");
  }
  const sayfalar: SheetData[] = [];
  wb.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= MAX_RETAINED_ROWS) return;
      // row.values seyrek dizi: boş hücreler DELİK. Array.from delikleri
      // doldurur; yoksa sütun sırası kayar ve telefon adın yerine yazılırdı.
      const values = Array.isArray(row.values) ? Array.from(row.values.slice(1)) : [];
      const cells = values.map(cellText);
      if (cells.every((c) => c.trim() === "")) return;
      rows.push(cells);
    });
    if (rows.length) sayfalar.push({ name: sheet.name, rows });
  });
  return sayfalar;
}

/**
 * Müşterilerin okunacağı sayfa: şablonun veri sayfası varsa o, yoksa ilk sayfa.
 * Rehber sayfası öne alınmış olsa bile "Nasıl doldurulur" satırları müşteri
 * sanılmasın diye ada göre aranıyor.
 */
export function musteriSayfasiniSec(sayfalar: SheetData[], istenen?: string): SheetData {
  if (!sayfalar.length) throw new BadRequestException("Dosyada dolu bir satır bulunamadı.");
  if (istenen) {
    const bulunan = sayfalar.find((s) => normalizeKey(s.name) === normalizeKey(istenen));
    if (!bulunan) {
      throw new BadRequestException(`"${istenen}" adlı sayfa yok. Sayfalar: ${sayfalar.map((s) => s.name).join(", ")}`);
    }
    return bulunan;
  }
  return sayfalar.find((s) => normalizeKey(s.name) === normalizeKey(SABLON_SAYFA_ADI)) ?? sayfalar[0];
}

export interface PlanlananMusteri {
  satir: number;
  party: Partial<Party> & { displayName: string };
  kisi?: { name: string; phone?: string; email?: string };
}

export interface MusteriPlani {
  toplamSatir: number;
  planlanan: PlanlananMusteri[];
  atlanan: { satir: number; sebep: string }[];
  /** Hangi alan hangi başlıktan okundu — önizlemede kullanıcıya gösterilir. */
  eslesenSutunlar: Record<string, string>;
  /** Tabloda olup hiçbir alana gitmeyen başlıklar: veri kaybı bu listede görünür. */
  kullanilmayanSutunlar: string[];
}

/** Başlık için sadeleştirme: yıldız, parantez içi ve iki nokta atılır ("Ad *", "Telefon (cep):"). */
function baslikAnahtari(value: unknown): string {
  return normalizeKey(String(value ?? "").replace(/\*/g, "").replace(/\([^)]*\)/g, "").replace(/:$/, ""));
}

/**
 * Hangi alanın hangi sütundan okunacağı.
 *
 * Sıra: modelin verdiği açık eşleme (esleme) > şablon başlığı ve eş adlar
 * (BİREBİR). Bulanık "içerir" eşleşmesi yalnızca açık eşlemede kullanılıyor:
 * kendiliğinden yapılsaydı "Yetkili telefon" sütunu "Telefon" alanına da
 * düşerdi ve firma telefonu yerine kişinin cebi yazılırdı.
 */
export function musteriSutunlariniBul(
  basliklar: string[],
  esleme: Partial<Record<MusteriAlani, string>> = {}
): Map<MusteriAlani, number> {
  const anahtarlar = basliklar.map(baslikAnahtari);
  const sonuc = new Map<MusteriAlani, number>();
  const kullanilan = new Set<number>();

  for (const [alan, baslik] of Object.entries(esleme) as [MusteriAlani, string][]) {
    if (!MUSTERI_SUTUNLARI.some((s) => s.alan === alan) || !baslik) continue;
    const i = resolveColumn(basliklar, baslik);
    if (i >= 0 && i < basliklar.length) {
      sonuc.set(alan, i);
      kullanilan.add(i);
    }
  }
  for (const s of MUSTERI_SUTUNLARI) {
    if (sonuc.has(s.alan)) continue;
    const adaylar = [s.baslik, ...s.esAdlar].map(baslikAnahtari);
    const i = anahtarlar.findIndex((a, idx) => !kullanilan.has(idx) && adaylar.includes(a));
    if (i >= 0) {
      sonuc.set(s.alan, i);
      kullanilan.add(i);
    }
  }
  return sonuc;
}

function rolleriCoz(deger: string): { roller: PartyRole[]; taninmayan: string[] } {
  const roller: PartyRole[] = [];
  const taninmayan: string[] = [];
  for (const parca of deger.split(/[,;/]/).map((p) => normalizeKey(p)).filter(Boolean)) {
    const bulunan = ROLLER.find((r) => normalizeKey(r.etiket) === parca || r.esAdlar.includes(parca));
    if (!bulunan) taninmayan.push(parca);
    else if (!roller.includes(bulunan.rol)) roller.push(bulunan.rol);
  }
  return { roller, taninmayan };
}

function turuCoz(deger: string): PartyType | undefined {
  const d = normalizeKey(deger);
  return TURLER.find((t) => normalizeKey(t.etiket) === d || t.esAdlar.includes(d))?.tur;
}

/**
 * Tabloyu kart listesine çevirir. Hiçbir şey YAZMAZ.
 *
 * Adı boş satır atlanır (gerekçesiyle). Tanınmayan rol ya da tür satırı
 * atlatmaz: kart açılır, değer varsayılana düşer ve bu bir UYARI olarak
 * döner — "Müşteri" yerine "Müşterimiz" yazıldı diye kart kaybolmamalı.
 */
export function planMusteriImport(
  sheet: SheetData,
  opts: {
    esleme?: Partial<Record<MusteriAlani, string>>;
    basliksatiri?: number;
    ilkSatir?: number;
    sonSatir?: number;
  } = {}
): MusteriPlani & { uyarilar: { satir: number; sebep: string }[] } {
  const baslikIndex = Math.max(0, (opts.basliksatiri ?? 1) - 1);
  const basliklar = (sheet.rows[baslikIndex] ?? []).map((h) => String(h ?? ""));
  const sutunlar = musteriSutunlariniBul(basliklar, opts.esleme);

  const eslesenSutunlar: Record<string, string> = {};
  for (const [alan, i] of sutunlar) eslesenSutunlar[alan] = basliklar[i];
  const kullanilanlar = new Set(sutunlar.values());
  const kullanilmayanSutunlar = basliklar.filter((h, i) => h.trim() && !kullanilanlar.has(i));

  const planlanan: PlanlananMusteri[] = [];
  const atlanan: { satir: number; sebep: string }[] = [];
  const uyarilar: { satir: number; sebep: string }[] = [];

  if (!sutunlar.has("displayName")) {
    return {
      toplamSatir: 0,
      planlanan,
      atlanan: [{ satir: baslikIndex + 1, sebep: "Ad sütunu bulunamadı (esleme ile displayName'i bir sütuna bağla)" }],
      uyarilar,
      eslesenSutunlar,
      kullanilmayanSutunlar,
    };
  }

  const ilk = Math.max(baslikIndex + 2, opts.ilkSatir ?? 0);
  const son = Math.min(sheet.rows.length, opts.sonSatir ?? Number.POSITIVE_INFINITY);
  let toplamSatir = 0;

  for (let satirNo = ilk; satirNo <= son; satirNo++) {
    const row = sheet.rows[satirNo - 1] ?? [];
    const al = (alan: MusteriAlani): string | undefined => {
      const i = sutunlar.get(alan);
      const v = i === undefined ? "" : String(row[i] ?? "").trim();
      return v || undefined;
    };
    if (row.every((c) => !String(c ?? "").trim())) continue;
    toplamSatir++;

    const ad = al("displayName");
    if (!ad) {
      atlanan.push({ satir: satirNo, sebep: "ad boş" });
      continue;
    }

    const party: PlanlananMusteri["party"] = { displayName: ad };
    const tur = al("partyType");
    if (tur) {
      const cozulen = turuCoz(tur);
      if (cozulen) party.partyType = cozulen;
      else uyarilar.push({ satir: satirNo, sebep: `"${tur}" türü tanınmadı, Firma sayıldı` });
    }
    const rol = al("roles");
    if (rol) {
      const { roller, taninmayan } = rolleriCoz(rol);
      if (roller.length) party.roles = roller;
      if (taninmayan.length) {
        uyarilar.push({
          satir: satirNo,
          sebep: `"${taninmayan.join(", ")}" rolü tanınmadı${roller.length ? "" : ", Aday müşteri sayıldı"}`,
        });
      }
    }
    party.legalName = al("legalName");
    party.taxNumber = al("taxNumber");
    party.taxOffice = al("taxOffice");
    party.email = al("email");
    party.phone = al("phone");
    party.website = al("website");
    party.notes = al("notes");
    const [city, district, line] = [al("city"), al("district"), al("address")];
    if (city || district || line) party.address = { city, district, line };

    const kisiAdi = al("contactName");
    const kisi = kisiAdi ? { name: kisiAdi, phone: al("contactPhone"), email: al("contactEmail") } : undefined;
    if (!kisiAdi && (al("contactPhone") || al("contactEmail"))) {
      uyarilar.push({ satir: satirNo, sebep: "yetkili kişinin adı boş, telefonu/e-postası eklenmedi" });
    }

    planlanan.push({ satir: satirNo, party, kisi });
  }

  return { toplamSatir, planlanan, atlanan, uyarilar, eslesenSutunlar, kullanilmayanSutunlar };
}

/**
 * Zaten kayıtlı olanları ve dosyanın KENDİ İÇİNDEKİ tekrarları ayıklar.
 *
 * Eşleşme: vergi no (kesin), e-posta (kesin) ya da normalize ad (bkz.
 * party-dedup: "ABC Ltd. Şti." ~ "abc"). Tek tek kart açılırken yinelenen
 * kart yalnızca UYARI, burada ise ATLAMA sebebi: tek tek girişte kullanıcı
 * uyarıyı görüp karar veriyor, 300 satırlık dosyada göremez — aynı dosyayı iki
 * kez yüklemek her müşteriyi ikiye katlamamalı. Vergi no ayrıca veritabanında
 * tekil; atlamasaydık toplu ekleme o satırda patlardı.
 *
 * `mevcut` arşivdekileri de içermeli: vergi no tekilliği arşivi de kapsıyor.
 */
export function mevcutlariAyikla(
  planlanan: PlanlananMusteri[],
  mevcut: Pick<Party, "id" | "displayName" | "taxNumber" | "email" | "archivedAt">[]
): { yeni: PlanlananMusteri[]; zatenVar: { satir: number; ad: string; mevcutKart: string; neden: string }[] } {
  const vergi = new Map<string, string>();
  const eposta = new Map<string, string>();
  const ad = new Map<string, string>();
  const ekle = (p: { displayName: string; taxNumber?: string; email?: string }, etiket: string) => {
    if (p.taxNumber && normalizeTaxNumber(p.taxNumber)) vergi.set(normalizeTaxNumber(p.taxNumber), etiket);
    if (p.email) eposta.set(normalizeEmail(p.email), etiket);
    const n = normalizeName(p.displayName);
    if (n) ad.set(n, etiket);
  };
  for (const m of mevcut) ekle(m, m.archivedAt ? `${m.displayName} (arşivde)` : m.displayName);

  const yeni: PlanlananMusteri[] = [];
  const zatenVar: { satir: number; ad: string; mevcutKart: string; neden: string }[] = [];
  for (const p of planlanan) {
    const v = p.party.taxNumber ? vergi.get(normalizeTaxNumber(p.party.taxNumber)) : undefined;
    const e = p.party.email ? eposta.get(normalizeEmail(p.party.email)) : undefined;
    const a = ad.get(normalizeName(p.party.displayName));
    const eslesen = v ?? e ?? a;
    if (eslesen) {
      zatenVar.push({
        satir: p.satir,
        ad: p.party.displayName,
        mevcutKart: eslesen,
        neden: v ? "aynı vergi no" : e ? "aynı e-posta" : "aynı ad",
      });
      continue;
    }
    yeni.push(p);
    // Dosyanın kendi içindeki tekrarı da yakalansın: ilk geçen kazanır.
    ekle(p.party, `${p.party.displayName} (dosyada ${p.satir}. satır)`);
  }
  return { yeni, zatenVar };
}
