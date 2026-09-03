import { randomUUID } from "node:crypto";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";

/**
 * LİO'NUN ÜRETTİĞİ RAPOR DOSYALARI.
 *
 * Lio artık "şu projenin görevlerini Excel'e dök" diyebiliyor. Üretilen dosya
 * iki yoldan birine gidiyor:
 *   - indirme: burada BELLEKTE tutulur, kullanıcı sohbetteki bağlantıya
 *     tıklayınca `GET /ai/exports/:id` ile iner.
 *   - dosya kitaplığı: FilesService ile işin/projenin klasörüne yüklenir
 *     (bkz. AiAssistantService.exportReport).
 *
 * NEDEN AYRI DOSYA: burada @Injectable YOK. Node'un yerleşik test koşucusu
 * dekoratör içeren dosyayı çözemiyor, o yüzden mantık dekoratörsüz duruyor ve
 * ai-exports.service.ts yalnızca Nest'e takılan ince kabuk (aynı ayrım:
 * ai-modules.ts, demo-ai-kotasi.ts).
 *
 * NEDEN BELLEKTE: rapor bir türev, kaynak veri zaten veritabanında. Kalıcı
 * saklamak hem depolama hem de "eski rapor güncel sanıldı" hatası demek.
 * Yarım saat, kullanıcının bağlantıya tıklaması için fazlasıyla yeterli;
 * kalıcı istiyorsa dosya kitaplığı seçeneği var. Sunucu yeniden başlarsa
 * bağlantı ölür ve kullanıcıya "raporu yeniden üretmem gerek" denir —
 * hazırlanmış ekler de aynı gerekçeyle bellekte duruyor (bkz.
 * ai-attachments.service.ts).
 */

export type ExportFormat = "xlsx" | "csv";

/** Rapora dökülecek tablo. Tek sayfa: rapor bir veri kümesidir, defter değil. */
export interface ExportTable {
  /** Excel'de sekme adı, CSV'de yalnızca dosya adına yansır. */
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

interface StoredExport {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  createdAt: number;
}

export interface BuiltExport {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  rowCount: number;
}

/** Bağlantının ömrü. */
export const EXPORT_TTL_MS = Number(process.env.AI_EXPORT_TTL_MS ?? 30 * 60 * 1000);

/**
 * Tek raporda azami satır.
 *
 * Sınır maliyet değil BELLEK kararı: dosya üretilene kadar tüm satırlar
 * bellekte duruyor. Sınırı aşan veri kümesi kesilir ve model kullanıcıya
 * kaçının dışarıda kaldığını söyler — sessizce eksik rapor vermek, elle
 * karşılaştırmadan fark edilmeyen bir hata olurdu.
 */
export const MAX_EXPORT_ROWS = Number(process.env.AI_EXPORT_MAX_ROWS ?? 5000);

/** Kullanıcı başına bellekte tutulan rapor sayısı; fazlası en eskiden düşer. */
const MAX_EXPORTS_PER_USER = 5;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIME = "text/csv; charset=utf-8";

export class AiExportStore {
  private readonly exports = new Map<string, StoredExport>();

  /**
   * Tabloyu dosyaya çevirir ve indirilebilir kılar.
   *
   * Dönen `id` sohbette `projelio:export/<id>` bağlantısı olarak yazılır
   * (bkz. apps/web/src/lib/messageLinks.ts).
   */
  async build(
    userId: string,
    params: { fileName: string; format: ExportFormat; table: ExportTable }
  ): Promise<BuiltExport> {
    const { table, format } = params;
    const rows = table.rows.slice(0, MAX_EXPORT_ROWS);
    const buffer = format === "csv" ? this.buildCsv(table, rows) : await this.buildXlsx(table, rows);

    const fileName = this.safeFileName(params.fileName, format);
    const record: StoredExport = {
      id: randomUUID(),
      userId,
      fileName,
      mimeType: format === "csv" ? CSV_MIME : XLSX_MIME,
      buffer,
      createdAt: Date.now(),
    };

    this.sweep();
    this.exports.set(record.id, record);
    this.trimUser(userId);

    return {
      id: record.id,
      fileName,
      mimeType: record.mimeType,
      sizeBytes: buffer.length,
      rowCount: rows.length,
    };
  }

  /**
   * İndirme ucunun okuduğu yer.
   *
   * Kimlik tahmin edilemez (UUID) ama yine de sahiplik doğrulanıyor: bağlantı
   * bir sohbet metninin içinde duruyor ve sohbet ekran görüntüsüyle
   * paylaşılabiliyor. Rapor kullanıcının kendi verisi, başkasının eline
   * geçmemeli.
   */
  take(id: string, userId: string): StoredExport {
    this.sweep();
    const found = this.exports.get(id);
    if (!found) {
      throw new NotFoundException(
        "Bu rapor artık hazır değil (bağlantının ömrü 30 dakika). Lio'dan yeniden üretmesini isteyebilirsin."
      );
    }
    if (found.userId !== userId) throw new ForbiddenException("Bu rapor sana ait değil.");
    return found;
  }

  private async buildXlsx(table: ExportTable, rows: ExportTable["rows"]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Projelio · Lio";
    wb.created = new Date();

    const sheet = wb.addWorksheet(this.safeSheetName(table.title));
    sheet.addRow(table.headers);
    for (const row of rows) sheet.addRow(row.map((cell) => cell ?? ""));
    sheet.getRow(1).font = { bold: true };
    // Sütun genişliği içeriğe göre: varsayılan genişlikte Türkçe başlıklar
    // ("Teslim tarihi") kesik görünüyor ve kullanıcı her sütunu elle açıyor.
    sheet.columns.forEach((column, index) => {
      const lengths = [String(table.headers[index] ?? "").length, ...rows.map((r) => String(r[index] ?? "").length)];
      column.width = Math.min(52, Math.max(12, ...lengths) + 2);
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * CSV.
   *
   * BOM ŞART: Excel BOM'suz UTF-8'i Windows-1254 sanıyor ve "Görüşme" gibi
   * başlıklar "GÃ¶rÃ¼ÅŸme" olarak açılıyor. Ayraç noktalı virgül: Türkçe
   * yerelde Excel virgülü ondalık ayracı sayıp tüm satırı tek hücreye yığıyor.
   */
  private buildCsv(table: ExportTable, rows: ExportTable["rows"]): Buffer {
    const escape = (value: unknown): string => {
      const text = value === undefined || value === null ? "" : String(value);
      return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      table.headers.map(escape).join(";"),
      ...rows.map((row) => row.map(escape).join(";")),
    ];
    return Buffer.from("\uFEFF" + lines.join("\r\n"), "utf8");
  }

  /** Excel sekme adının kabul etmediği karakterler ve 31 karakter sınırı. */
  private safeSheetName(title: string): string {
    const cleaned = (title || "Rapor").replace(/[[\]:*?/\\]/g, " ").trim();
    return cleaned.slice(0, 31) || "Rapor";
  }

  /** Dosya adı: yol ayracı ve kontrol karakteri barındıramaz. */
  private safeFileName(name: string, format: ExportFormat): string {
    const base = (name || "rapor")
      .replace(/[/\\?%*:|"<>\s]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    return base.toLowerCase().endsWith(`.${format}`) ? base : `${base}.${format}`;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, record] of this.exports) {
      if (now - record.createdAt > EXPORT_TTL_MS) this.exports.delete(id);
    }
  }

  private trimUser(userId: string): void {
    const mine = [...this.exports.values()]
      .filter((e) => e.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);
    while (mine.length > MAX_EXPORTS_PER_USER) {
      const oldest = mine.shift();
      if (oldest) this.exports.delete(oldest.id);
    }
  }
}
