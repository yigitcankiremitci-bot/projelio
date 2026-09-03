// TABLODAN TOPLU İÇE AKTARMANIN BEYNİ.
//
// NEDEN VAR: 100 satırlık bir Excel'i modele okutup 100 görevi tek tek geri
// yazdırmak hem pahalı hem kırılgandı — dosya metni 20.000 karakterde kırpılıyor,
// create_tasks tek çağrıda 10 kalem alıyor, yanıt tavanı 2.000 token ve istek 8
// turda duraklıyordu. 100 görev 15-20 tur ediyordu ve satırların bir kısmı hiç
// görülmüyordu.
//
// ÇÖZÜM: veri sunucuda kalır, model yalnızca EŞLEME KURALINI yazar
// ("başlık = 'Görev Adı' sütunu, hedef = 'Birim' sütunu, Pazarlama -> şu departman").
// Satırları okuyan, tarihleri çözen, hedefe dağıtan ve atlananları gerekçesiyle
// sayan taraf burasıdır. Model 100 satır yazmaz, tek çağrı yazar.
//
// Dekoratör YOK: Node'un yerleşik test koşucusu dekoratörlü dosyayı çözemiyor
// (bkz. ai-modules.ts, ai-export-builder.ts ile aynı ayrım).

/** Bellekte tutulan bir sayfa. Satırlar hücre metni olarak saklanır. */
export interface SheetData {
  name: string;
  rows: string[][];
  /** Satır sınırına takılıp kesildiyse: kullanıcıya söylenmesi gerekir. */
  truncated?: boolean;
}

/** Görev alanlarının hangi SÜTUNDAN geleceği. Değerler sütun BAŞLIĞIDIR. */
export interface TaskColumnMap {
  baslik?: string;
  aciklama?: string;
  teslim?: string;
  baslangic?: string;
  atanan?: string;
  butce?: string;
}

/** "Bu sütunda şu değer varsa görev şuraya" kuralı. */
export interface TargetRule {
  deger: string;
  projectId?: string;
  departmentId?: string;
}

export interface ImportTarget {
  /** Tüm satırlar tek hedefe gidiyorsa. */
  projectId?: string;
  departmentId?: string;
  /** Satır satır dağıtım: hangi sütuna bakılacak ve hangi değer nereye gidecek. */
  kolon?: string;
  kurallar?: TargetRule[];
  /** Kural eşleşmezse kullanılacak hedef; verilmezse satır atlanır. */
  varsayilanProjectId?: string;
  varsayilanDepartmentId?: string;
}

export interface RowRange {
  /** Başlık satırının numarası (1 tabanlı). Varsayılan 1. */
  basliksatiri?: number;
  ilkSatir?: number;
  sonSatir?: number;
}

export interface PlannedTask {
  satir: number;
  projectId?: string;
  departmentId?: string;
  /** Kullanıcıya gösterilecek hedef adı ("Pazarlama", "varsayılan"). */
  hedefAdi: string;
  title: string;
  description?: string;
  deadline?: string;
  startDate?: string;
  budget?: number;
  assignedTo?: string;
}

export interface SkippedRow {
  satir: number;
  sebep: string;
}

export interface TaskImportPlan {
  toplamSatir: number;
  planlanan: PlannedTask[];
  atlanan: SkippedRow[];
  /** Kayıp değil ama söylenmesi gereken şeyler (çözülemeyen tarih gibi). */
  uyarilar: SkippedRow[];
}

export interface RecordImportPlan {
  toplamSatir: number;
  planlanan: { satir: number; data: Record<string, string> }[];
  atlanan: SkippedRow[];
}

/** Tek içe aktarma çağrısında işlenecek azami satır; fazlası aralıkla istenir. */
export const MAX_IMPORT_ROWS = Number(process.env.AI_MAX_IMPORT_ROWS ?? 300);

/** Bir sayfadan bellekte tutulan azami satır. */
export const MAX_RETAINED_ROWS = Number(process.env.AI_MAX_SHEET_ROWS ?? 5000);

/**
 * Sohbete sabitlenen tablo metninin sınırı.
 *
 * Bunun ALTINDA kalan tablolar bugünkü gibi tamamen sabitlenir: küçük bir
 * alışveriş listesi için modeli read_sheet çağırmaya zorlamak bir tur daha
 * yakardı. Üstündekiler künyeye düşer, gerisini sunucu okur.
 */
export const INLINE_SHEET_CHARS = Number(process.env.AI_INLINE_SHEET_CHARS ?? 4000);

/**
 * CSV'yi satır/hücreye böler.
 *
 * Kütüphane eklemeye değmedi: ihtiyaç tek bir şey, tırnak içindeki ayraç ve
 * satır sonunu doğru geçmek. Ayraç dosyadan bulunuyor — Türkçe Excel noktalı
 * virgülle yazıyor, geri kalan dünya virgülle.
 */
export function parseCsv(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const ilkSatir = text.slice(0, text.indexOf("\n") + 1 || text.length);
  const ayrac = (ilkSatir.match(/;/g)?.length ?? 0) > (ilkSatir.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let tirnakta = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (tirnakta) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else tirnakta = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') tirnakta = true;
    else if (ch === ayrac) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else if (ch !== "\r") cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** Karşılaştırma için sadeleştirme: Türkçe küçük harf, kırpma, tek boşluk. */
export function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr");
}

/**
 * Sütun adını başlık satırında bulur.
 *
 * Model başlığı kullanıcıdan/dosyadan okuyup yazıyor; birebir tutmayabilir
 * ("Görev Adı" yerine "görev adı", "Termin Tarihi" yerine "termin"). Bu yüzden
 * sırayla: birebir, baştan eşleşme, içerme. Bulunamazsa sütun HARFİ (A, B, C)
 * ya da 1 tabanlı sıra numarası da kabul edilir — model bazen onu veriyor.
 */
export function resolveColumn(headers: string[], wanted?: string): number {
  const key = normalizeKey(wanted);
  if (!key) return -1;

  const normalized = headers.map(normalizeKey);
  const exact = normalized.indexOf(key);
  if (exact >= 0) return exact;

  // Sütun HARFİ ya da sıra numarası. Bulanık eşleşmeden ÖNCE bakılır: "D"
  // diyen model D sütununu kastediyor, "Detay" başlığını değil. Tek harfle
  // sınırlı — "Ad" gibi iki harfli gerçek başlıkları sütun referansı sanıp
  // 30. sütuna gitmesin.
  if (/^[a-z]$/.test(key)) return key.charCodeAt(0) - 97;
  if (/^\d+$/.test(key)) return Number(key) - 1;

  const starts = normalized.findIndex((h) => h && h.startsWith(key));
  if (starts >= 0) return starts;

  const includes = normalized.findIndex((h) => h && (h.includes(key) || key.includes(h)));
  if (includes >= 0) return includes;

  return -1;
}

const AYLAR: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};

const iki = (n: number) => String(n).padStart(2, "0");

/**
 * Hücredeki tarihi ISO (YYYY-MM-DD) biçimine çevirir.
 *
 * Dört biçim geliyor: gerçek tarih hücresi (ExcelJS Date -> zaten ISO),
 * "12.03.2026" / "12/03/2026", "12 Mart 2026" ve tarih olarak biçimlenmemiş
 * hücrelerdeki Excel SERİ NUMARASI. Seri numarası yalnızca makul aralıkta
 * kabul edilir: aksi halde "45000" yazan bir bütçe hücresi tarihe dönerdi.
 *
 * Modelin 100 satırın tarihini tek tek doğru çevirmesini beklemek yanlıştı:
 * hatası görünmez, kullanıcı ancak takvime bakınca fark ederdi.
 */
export function parseSheetDate(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return `${iso[1]}-${iki(Number(iso[2]))}-${iki(Number(iso[3]))}`;

  const noktali = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(text);
  if (noktali) {
    const yil = Number(noktali[3]) < 100 ? 2000 + Number(noktali[3]) : Number(noktali[3]);
    return `${yil}-${iki(Number(noktali[2]))}-${iki(Number(noktali[1]))}`;
  }

  const yazili = /^(\d{1,2})\s+([^\s\d]+)\s*(\d{4})?$/.exec(text);
  if (yazili) {
    const ay = AYLAR[normalizeKey(yazili[2])];
    if (ay) {
      const yil = yazili[3] ? Number(yazili[3]) : new Date().getFullYear();
      return `${yil}-${iki(ay)}-${iki(Number(yazili[1]))}`;
    }
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const seri = Number(text);
    // 20.000 ≈ 1954, 60.000 ≈ 2064. Dışarısı tarih değil, sayıdır.
    if (seri >= 20000 && seri <= 60000) {
      // Excel'in başlangıcı 1899-12-30 (1900 artık yıl hatası dahil).
      const ms = Date.UTC(1899, 11, 30) + Math.floor(seri) * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }

  return undefined;
}

/** "1.250,50" ve "1,250.50" biçimlerini sayıya çevirir. */
export function parseSheetNumber(value: unknown): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  // Binlik ayracını atmadan önce hangi ayracın ondalık olduğunu belirle:
  // en SAĞDAKİ ayraç ondalıktır.
  let temiz = text.replace(/[^\d.,-]/g, "");
  const sonNokta = temiz.lastIndexOf(".");
  const sonVirgul = temiz.lastIndexOf(",");

  if (sonVirgul >= 0 && sonNokta >= 0) {
    // İki ayraç da varsa SAĞDAKİ ondalıktır: "1.250,50" ve "1,250.50".
    if (sonVirgul > sonNokta) temiz = temiz.replace(/\./g, "").replace(",", ".");
    else temiz = temiz.replace(/,/g, "");
  } else {
    // Tek ayraç belirsiz: "15.000" Türkçe'de on beş bin, İngilizce'de on beş.
    // Ayraçtan sonra TAM ÜÇ hane varsa binlik kabul edilir — Türkçe tabloda
    // "15.000 ₺"yi 15 diye okumak sessiz ve büyük bir hata olurdu.
    const ayrac = sonVirgul >= 0 ? sonVirgul : sonNokta;
    if (ayrac >= 0) {
      const kuyruk = temiz.length - ayrac - 1;
      const binlik = kuyruk === 3 && /^[\d.,-]+$/.test(temiz) && temiz.split(/[.,]/).length >= 2;
      temiz = binlik ? temiz.replace(/[.,]/g, "") : temiz.replace(",", ".");
    }
  }

  const sayi = Number(temiz);
  return Number.isFinite(sayi) ? sayi : undefined;
}

/** Sayfanın başlık satırı ve işlenecek satır aralığı. */
function kesit(sheet: SheetData, range: RowRange) {
  const headerRow = Math.max(1, Number(range.basliksatiri) || 1);
  const headers = sheet.rows[headerRow - 1] ?? [];
  const ilk = Math.max(headerRow + 1, Number(range.ilkSatir) || headerRow + 1);
  const son = Math.min(sheet.rows.length, Number(range.sonSatir) || sheet.rows.length);
  return { headers, ilk, son };
}

/** Hedef kuralını satıra uygular. */
function hedefBul(
  target: ImportTarget,
  hedefKolonu: number,
  row: string[]
): { projectId?: string; departmentId?: string; hedefAdi: string } | { hata: string } {
  if (target.projectId || target.departmentId) {
    return { projectId: target.projectId, departmentId: target.departmentId, hedefAdi: "tek hedef" };
  }

  const deger = hedefKolonu >= 0 ? (row[hedefKolonu] ?? "").trim() : "";
  const kural = (target.kurallar ?? []).find((k) => normalizeKey(k.deger) === normalizeKey(deger));
  if (kural && (kural.projectId || kural.departmentId)) {
    return { projectId: kural.projectId, departmentId: kural.departmentId, hedefAdi: kural.deger };
  }

  if (target.varsayilanProjectId || target.varsayilanDepartmentId) {
    return {
      projectId: target.varsayilanProjectId,
      departmentId: target.varsayilanDepartmentId,
      hedefAdi: "varsayılan",
    };
  }

  // Uydurma hedef YOK: eşleşmeyen satır atlanır ve sebebi söylenir. Modelin
  // "nereye koyacağımı bulamadım, o zaman yeni proje açayım" refleksi geçmişte
  // görevleri yanlış yere yığmıştı (bkz. sistem promptu "Görev nereye açılır").
  return { hata: deger ? `hedef eşleşmedi: "${deger}"` : "hedef sütunu boş" };
}

/** Görev içe aktarma planı. Hiçbir şey yazmaz; ne olacağını hesaplar. */
export function planTaskImport(
  sheet: SheetData,
  spec: { esleme: TaskColumnMap; hedef: ImportTarget; atananKurallari?: { deger: string; userId: string }[] } & RowRange
): TaskImportPlan {
  const { headers, ilk, son } = kesit(sheet, spec);
  const kolon = {
    baslik: resolveColumn(headers, spec.esleme?.baslik),
    aciklama: resolveColumn(headers, spec.esleme?.aciklama),
    teslim: resolveColumn(headers, spec.esleme?.teslim),
    baslangic: resolveColumn(headers, spec.esleme?.baslangic),
    atanan: resolveColumn(headers, spec.esleme?.atanan),
    butce: resolveColumn(headers, spec.esleme?.butce),
  };
  if (kolon.baslik < 0) {
    throw new Error(
      `Başlık sütunu bulunamadı ("${spec.esleme?.baslik ?? ""}"). Sayfadaki başlıklar: ${headers.join(", ")}`
    );
  }
  const hedefKolonu = resolveColumn(headers, spec.hedef?.kolon);

  const planlanan: PlannedTask[] = [];
  const atlanan: SkippedRow[] = [];
  const uyarilar: SkippedRow[] = [];
  let toplamSatir = 0;

  for (let i = ilk; i <= son; i++) {
    const row = sheet.rows[i - 1];
    if (!row || row.every((cell) => !String(cell ?? "").trim())) continue;
    toplamSatir += 1;

    const title = String(row[kolon.baslik] ?? "").trim();
    if (!title) {
      atlanan.push({ satir: i, sebep: "başlık boş" });
      continue;
    }

    const hedef = hedefBul(spec.hedef ?? {}, hedefKolonu, row);
    if ("hata" in hedef) {
      atlanan.push({ satir: i, sebep: hedef.hata });
      continue;
    }

    const ham = kolon.teslim >= 0 ? String(row[kolon.teslim] ?? "").trim() : "";
    const deadline = ham ? parseSheetDate(ham) : undefined;
    if (ham && !deadline) uyarilar.push({ satir: i, sebep: `tarih çözülemedi: "${ham}"` });

    const atananAdi = kolon.atanan >= 0 ? String(row[kolon.atanan] ?? "").trim() : "";
    const atananKurali = atananAdi
      ? (spec.atananKurallari ?? []).find((k) => normalizeKey(k.deger) === normalizeKey(atananAdi))
      : undefined;
    if (atananAdi && !atananKurali) uyarilar.push({ satir: i, sebep: `kişi eşleşmedi: "${atananAdi}"` });

    planlanan.push({
      satir: i,
      projectId: hedef.projectId,
      departmentId: hedef.departmentId,
      hedefAdi: hedef.hedefAdi,
      title,
      description: kolon.aciklama >= 0 ? String(row[kolon.aciklama] ?? "").trim() || undefined : undefined,
      deadline,
      startDate: kolon.baslangic >= 0 ? parseSheetDate(row[kolon.baslangic]) : undefined,
      budget: kolon.butce >= 0 ? parseSheetNumber(row[kolon.butce]) : undefined,
      assignedTo: atananKurali?.userId,
    });
  }

  return { toplamSatir, planlanan, atlanan, uyarilar };
}

/** Modül kaydı içe aktarma planı. Alan doğrulaması çağıran tarafta yapılır. */
export function planRecordImport(
  sheet: SheetData,
  spec: { esleme: Record<string, string> } & RowRange
): RecordImportPlan {
  const { headers, ilk, son } = kesit(sheet, spec);
  const eslesmeler = Object.entries(spec.esleme ?? {}).map(([alan, sutun]) => ({
    alan,
    index: resolveColumn(headers, sutun),
    sutun,
  }));

  const bulunamayan = eslesmeler.filter((e) => e.index < 0);
  if (bulunamayan.length) {
    throw new Error(
      `Şu sütunlar bulunamadı: ${bulunamayan.map((e) => `"${e.sutun}"`).join(", ")}. ` +
        `Sayfadaki başlıklar: ${headers.join(", ")}`
    );
  }
  if (!eslesmeler.length) throw new Error("Hiçbir alan eşlemesi verilmedi.");

  const planlanan: { satir: number; data: Record<string, string> }[] = [];
  const atlanan: SkippedRow[] = [];
  let toplamSatir = 0;

  for (let i = ilk; i <= son; i++) {
    const row = sheet.rows[i - 1];
    if (!row || row.every((cell) => !String(cell ?? "").trim())) continue;
    toplamSatir += 1;

    const data: Record<string, string> = {};
    for (const { alan, index } of eslesmeler) {
      const deger = String(row[index] ?? "").trim();
      if (deger) data[alan] = deger;
    }

    if (Object.keys(data).length === 0) {
      atlanan.push({ satir: i, sebep: "eşlenen sütunların hepsi boş" });
      continue;
    }
    planlanan.push({ satir: i, data });
  }

  return { toplamSatir, planlanan, atlanan };
}

/** Bir sütundaki farklı değerler ve kaç satırda geçtikleri. */
export function distinctValues(
  sheet: SheetData,
  kolonAdi: string,
  range: RowRange = {}
): { deger: string; adet: number }[] {
  const { headers, ilk, son } = kesit(sheet, range);
  const index = resolveColumn(headers, kolonAdi);
  if (index < 0) throw new Error(`Sütun bulunamadı: "${kolonAdi}". Başlıklar: ${headers.join(", ")}`);

  const sayac = new Map<string, { deger: string; adet: number }>();
  for (let i = ilk; i <= son; i++) {
    const deger = String(sheet.rows[i - 1]?.[index] ?? "").trim();
    if (!deger) continue;
    const key = normalizeKey(deger);
    const mevcut = sayac.get(key);
    if (mevcut) mevcut.adet += 1;
    else sayac.set(key, { deger, adet: 1 });
  }
  return [...sayac.values()].sort((a, b) => b.adet - a.adet);
}

/**
 * Sohbete sabitlenecek KÜNYE.
 *
 * Tablonun tamamı yerine: sayfa adları, satır sayısı, başlık satırı ve birkaç
 * örnek satır. Model sütunları buradan tanır; gerisini okumasına gerek yok,
 * içe aktarmayı sunucu yapıyor. 20.000 karakterlik metin yerine ~600 karakter.
 */
export function buildSheetSummary(sheets: SheetData[], ornekSatir = 4): string {
  const lines: string[] = [];
  for (const sheet of sheets) {
    lines.push(`## Sayfa: ${sheet.name} · ${sheet.rows.length} satır${sheet.truncated ? " (kesildi)" : ""}`);
    const gosterilecek = sheet.rows.slice(0, ornekSatir + 1);
    for (const row of gosterilecek) lines.push(row.join(" | "));
    if (sheet.rows.length > gosterilecek.length) {
      lines.push(`… (ilk ${gosterilecek.length} satır gösterildi; gerisi sunucuda duruyor)`);
    }
    lines.push("");
  }
  lines.push(
    "Bu bir KÜNYEDİR, tablonun tamamı değil. Satırları okumak için read_sheet, " +
      "toplu kayıt açmak için import_tasks_from_sheet / import_module_records_from_sheet kullan — " +
      "satırları buraya döktürme."
  );
  return lines.join("\n");
}
