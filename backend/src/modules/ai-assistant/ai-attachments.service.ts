import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import * as mammoth from "mammoth";
import { CloudStorageService, GOOGLE_DOC_EXPORT_MIME } from "../cloud-storage/cloud-storage.service";
import { FilesService } from "../files/files.service";
// OneDrive'da klasörlerin MIME'ı olmadığı için servis onlara kendi işaretini koyuyor;
// gezinme sonucunda klasörü dosyadan ayırmanın tek yolu bu (bkz. onedrive.service.ts).
import { FOLDER_MIME } from "../microsoft/onedrive.service";
import { AiCreditsService } from "./ai-credits.service";
import { estimateTranscriptionCredits } from "./ai-credits.config";
import { AiTranscriptionService, MAX_AUDIO_BYTES } from "./ai-transcription.service";
import {
  buildSheetSummary,
  INLINE_SHEET_CHARS,
  MAX_RETAINED_ROWS,
  parseCsv,
  type SheetData,
} from "./ai-sheet-import";

/** Lio'nun okuyabildiği ek türleri. */
export type AttachmentKind = "image" | "pdf" | "document" | "sheet" | "text" | "audio";

/**
 * Hazırlanmış (okunmuş) bir ek.
 *
 * "Hazırlamak" = içeriği bir kez çıkarmak. Ses çözümleme gibi ücretli işler burada
 * bir kez yapılır ve ücreti bir kez düşülür; kullanıcı aynı eki birkaç mesajda
 * kullansa bile ikinci kez ödemez.
 */
export interface PreparedAttachment {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  /** Modele metin olarak verilecek içerik (görsel ve PDF'te boş). */
  text?: string;
  /** Modele ikili olarak verilecek içerik — yalnızca görsel ve PDF. */
  base64?: string;
  /** Kullanıcıya gösterilen kısa döküm: "3 sayfa · 240 satır", "1 dk 12 sn ses". */
  detail: string;
  /**
   * TABLONUN SATIRLARI (yalnızca Excel/CSV).
   *
   * Modele gitmez, sunucuda durur: 100 satırlık bir dosyayı modele okutup
   * geri yazdırmak yerine satırları burada tutup içe aktarmayı sunucuda
   * yapıyoruz (bkz. ai-sheet-import.ts). Model yalnızca künyeyi görür.
   */
  sheets?: SheetData[];
  /** Bu eki hazırlarken şimdiden düşülen kredi (ses çözümleme). */
  creditsCharged: number;
  createdAt: number;
  /**
   * Dosya bir sohbete sabitlendiyse ikili içeriğin bellekte tutulacağı son an.
   *
   * Görsel ve PDF'in içeriği veritabanına yazılmıyor (satırları şişirir), ama iş
   * bitene kadar her turda modele gönderilmesi gerekiyor — bu yüzden yalnızca
   * onlar daha uzun süre bellekte tutulur.
   */
  retainedUntil?: number;
}

/** İstemciye dönen hâli — ikili içerik ve ham metin dışarı sızmaz. */
export interface AttachmentSummary {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  detail: string;
  creditsCharged: number;
}

// --- Sınırlar -------------------------------------------------------------
// Her sınır doğrudan ya bir sağlayıcı kısıtı ya da bir maliyet kararıdır.

/** Anthropic'in tek görsel için kabul ettiği üst sınır. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** PDF base64'e çevrilip istek gövdesine giriyor; bunun üstü isteği şişiriyor. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** Word/Excel/metin dosyaları için üst sınır. */
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
/**
 * Bir ekten modele verilecek azami karakter.
 *
 * Bu metin sohbet geçmişine yazılır ve SONRAKİ HER TURDA yeniden gönderilir —
 * yani sınırı yükseltmek yalnızca bir isteği değil, o sohbetin tamamını
 * pahalılaştırır. 20.000 karakter ≈ 5.000 token ≈ tur başına birkaç kredi.
 */
const MAX_TEXT_CHARS = Number(process.env.AI_ATTACHMENT_TEXT_CHARS ?? 20_000);
// Excel'de sayfa başına okunacak azami satır artık burada değil: satırlar
// sunucuda saklandığı için sınır MAX_RETAINED_ROWS (bkz. ai-sheet-import.ts).
/** Tek mesaja iliştirilebilecek azami ek. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
/**
 * Multer'ın kabul edeceği üst sınır — türe özel sınırlar (görsel 5 MB, PDF 20 MB…)
 * dosya okunduktan sonra ayrıca uygulanır. Buradaki değer en geniş türe (ses) göredir.
 */
export const MAX_ATTACHMENT_UPLOAD_BYTES = MAX_AUDIO_BYTES;
/** Hazırlanmış ekler (henüz gönderilmemiş) bellekte bu süre kadar durur. */
const ATTACHMENT_TTL_MS = 30 * 60 * 1000;
/** Bir sohbete sabitlenmiş görsel/PDF'in ikili içeriğinin bellekte tutulma süresi. */
const RETAINED_TTL_MS = Number(process.env.AI_RETAINED_FILE_TTL_MS ?? 2 * 60 * 60 * 1000);

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/**
 * Uzantıdan MIME türetme tablosu.
 * Drive/OneDrive ve bazı tarayıcılar dosyaları "application/octet-stream" olarak
 * bildiriyor; o durumda tek güvenilir ipucu uzantı oluyor.
 */
const EXTENSION_MIMES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "audio/webm",
  mp4: "audio/mp4",
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : "";
}

function effectiveMime(mimeType: string, name: string): string {
  const declared = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== "binary/octet-stream") {
    return declared;
  }
  return EXTENSION_MIMES[extensionOf(name)] ?? declared ?? "application/octet-stream";
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function humanDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes} dk ${rest} sn` : `${rest} sn`;
}

/** Excel hücresi zengin metin, formül, tarih veya köprü olabilir; hepsi düz metne iner. */
function cellText(value: any): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part: any) => part?.text ?? "").join("");
    // Formül hücresinde modeli ilgilendiren formül değil SONUÇtur.
    if ("result" in value) return cellText(value.result);
    if ("text" in value) return String(value.text);
    if ("hyperlink" in value) return String(value.hyperlink);
    return "";
  }
  return String(value);
}

@Injectable()
export class AiAttachmentsService {
  private readonly logger = new Logger(AiAttachmentsService.name);
  /**
   * Hazırlanmış ekler bellekte tutulur; kalıcı olarak SAKLANMAZ.
   *
   * Bilinçli bir karar: sohbete iliştirilen dosya bir proje dosyası değildir.
   * Drive'a yazmak hem kotayı şişirir hem de kullanıcıya her yüklemede "bu dosya
   * hangi işe ait?" diye sormayı gerektirirdi. Modele gidip çıkarılan metin
   * mesaj kaydına yazılır, ikili içerik turdan sonra düşer.
   */
  private readonly prepared = new Map<string, PreparedAttachment>();

  constructor(
    private creditsService: AiCreditsService,
    private transcription: AiTranscriptionService,
    private cloudStorage: CloudStorageService,
    private filesService: FilesService
  ) {}

  /**
   * Sesli komut: kaydı yazıya çevirir ve ücretini düşer.
   *
   * Ek hazırlamaktan (prepareFromUpload) ayrı durur çünkü sonuç bir DOSYA değil,
   * kullanıcının yazacağı METİN. Sohbete iliştirilmez, bellekte tutulmaz;
   * çözümlenir, ücreti düşülür ve metin arayüze döner.
   */
  async transcribeCommand(
    userId: string,
    file: Express.Multer.File,
    conversationId?: string
  ): Promise<{ text: string; durationSeconds: number; creditsCharged: number; balance: number }> {
    if (!file?.buffer?.length) throw new BadRequestException("Ses kaydı gönderilmedi.");

    // Çözümleme ücretli; bakiye yetmiyorsa İŞLEM HİÇ YAPILMAZ (bkz. prepare()).
    const available = await this.creditsService.assertCanStart(userId);
    this.creditsService.assertBalanceCovers(available, estimateTranscriptionCredits(file.buffer.length));

    const result = await this.transcription.transcribe(
      file.buffer,
      file.originalname || "komut.webm",
      file.mimetype || "audio/webm"
    );

    const { credits, balanceAfter } = await this.creditsService.chargeTranscription({
      userId,
      durationSeconds: result.durationSeconds,
      fileName: "sesli komut",
      conversationId,
    });

    this.logger.log(
      `Sesli komut çözümlendi · kullanıcı=${userId.slice(0, 8)}… ` +
        `süre=${Math.round(result.durationSeconds)}sn kredi=${credits}`
    );

    return {
      text: result.text,
      durationSeconds: result.durationSeconds,
      creditsCharged: credits,
      balance: balanceAfter,
    };
  }

  // --- Kaynaklar ---------------------------------------------------------

  /** Kullanıcının bilgisayarından yüklenen dosya. */
  async prepareFromUpload(
    userId: string,
    file: Express.Multer.File,
    conversationId?: string
  ): Promise<AttachmentSummary> {
    if (!file?.buffer) throw new BadRequestException("Dosya gönderilmedi.");
    return this.prepare(userId, file.buffer, file.originalname || "dosya", file.mimetype, conversationId);
  }

  /** Zaten Projelio'da kayıtlı bir dosya (yetki kontrolü FilesService'te yapılır). */
  async prepareFromProjelioFile(
    userId: string,
    fileId: string,
    conversationId?: string
  ): Promise<AttachmentSummary> {
    if (!fileId) throw new BadRequestException("fileId gerekli.");
    const { response, fileName, mimeType } = await this.filesService.openDownload(fileId, userId);
    const buffer = Buffer.from(await response.arrayBuffer());
    return this.prepare(userId, buffer, fileName, mimeType, conversationId);
  }

  /**
   * Kullanıcının kendi Drive/OneDrive'ındaki, Projelio'ya hiç aktarılmamış dosya.
   *
   * Google tarafında dosya kimliği tarayıcıdaki resmi Picker'dan gelir; Picker'dan
   * seçilen dosyaya uygulamanın dar `drive.file` kapsamı otomatik erişim kazanır
   * (bkz. lib/googlePicker.ts). OneDrive'da ise gezinme backend'den yapılır.
   */
  async prepareFromCloud(
    userId: string,
    sourceFileId: string,
    conversationId?: string
  ): Promise<AttachmentSummary> {
    if (!sourceFileId) throw new BadRequestException("sourceFileId gerekli.");
    const { provider, accountId } = await this.requireCloudAccount(userId);
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);

    const meta = await this.cloudStorage.getFile(provider, accessToken, sourceFileId);
    const response = await this.cloudStorage.downloadResponse(provider, accessToken, sourceFileId, meta.mimeType);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Google Dokümanı/E-Tablosu indirilirken docx/xlsx'e dönüştürülerek gelir;
    // ayrıştırıcının doğru olanı seçebilmesi için ad ve MIME de ona göre düzeltilir.
    const exportAs = GOOGLE_DOC_EXPORT_MIME[meta.mimeType];
    const name = exportAs ? `${meta.name}.${exportAs.ext}` : meta.name;
    const mimeType = exportAs ? exportAs.mime : meta.mimeType;

    return this.prepare(userId, buffer, name, mimeType, conversationId);
  }

  /** OneDrive gezinmesi (Google'da bunun yerine tarayıcıdaki Picker açılır). */
  async browseCloud(userId: string, folderId?: string) {
    const { provider, accountId } = await this.requireCloudAccount(userId);
    if (provider === "google") {
      throw new BadRequestException("Google Drive'da dosya seçimi tarayıcıdaki Picker penceresiyle yapılır.");
    }
    const accessToken = await this.cloudStorage.getAccessToken(provider, accountId);
    const files = await this.cloudStorage.listFiles(provider, accessToken, folderId);
    return {
      provider,
      entries: files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder: f.mimeType === FOLDER_MIME,
        size: f.size,
      })),
    };
  }

  /** Kullanıcının hangi bulut sağlayıcısına bağlı olduğu — arayüz seçiciyi buna göre açar. */
  async connectedProvider(userId: string): Promise<{ provider: "google" | "microsoft" | null }> {
    const resolved = await this.cloudStorage.findAccountForUser(userId);
    return { provider: resolved?.provider ?? null };
  }

  private async requireCloudAccount(userId: string) {
    const resolved = await this.cloudStorage.findAccountForUser(userId);
    if (!resolved) {
      throw new BadRequestException(
        "Bağlı bir Google Drive ya da OneDrive hesabın yok. Ayarlardan bir hesap bağladıktan sonra tekrar dene."
      );
    }
    return { provider: resolved.provider, accountId: resolved.account.id };
  }

  // --- Hazırlama ---------------------------------------------------------

  /** Hazırlanmış ekleri sohbet turunda kullanmak için çözer. */
  take(userId: string, ids: string[]): PreparedAttachment[] {
    this.sweep();
    if (!ids?.length) return [];
    if (ids.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new BadRequestException(`Tek mesajda en fazla ${MAX_ATTACHMENTS_PER_MESSAGE} dosya gönderebilirsin.`);
    }
    return ids.map((id) => {
      const found = this.prepared.get(id);
      if (!found || found.userId !== userId) {
        throw new BadRequestException("Dosyanın süresi doldu ya da bulunamadı. Lütfen tekrar yükle.");
      }
      return found;
    });
  }

  discard(userId: string, id: string): void {
    const found = this.prepared.get(id);
    if (found && found.userId === userId) this.prepared.delete(id);
  }

  /**
   * Sohbete sabitlenen ekleri saklamaya alır.
   *
   * Metin taşıyan türlerde bellekte tutulacak bir şey yok — içerik zaten
   * veritabanındaki aktif dosya kaydında. Yalnızca görsel ve PDF'in base64'ü
   * kalır, o da süreli: aksi halde her yüklenen görsel süreç ömrü boyunca bellekte
   * dururdu.
   */
  retain(userId: string, ids: string[]): void {
    const until = Date.now() + RETAINED_TTL_MS;
    for (const id of ids) {
      const record = this.prepared.get(id);
      if (!record || record.userId !== userId) continue;
      // Tablolar da bellekte kalır: satırları sunucu okuyor (bkz. sheets).
      if (!record.base64 && !record.sheets) {
        this.prepared.delete(id);
        continue;
      }
      record.retainedUntil = until;
      // Metin sürümü varsa bellekten düşer; kalıcı kopya veritabanında.
      record.text = undefined;
    }
  }

  /** Sabitlenmiş bir görsel/PDF'in ikili içeriği (süresi dolduysa undefined). */
  getBinary(userId: string, id: string): string | undefined {
    this.sweep();
    const record = this.prepared.get(id);
    if (!record || record.userId !== userId) return undefined;
    return record.base64;
  }

  /**
   * Sabitlenmiş bir tablonun satırları (süresi dolduysa undefined).
   *
   * read_sheet ve import_* araçlarının tek veri kaynağı. Sahiplik burada
   * doğrulanır: kimlik sohbet metninde görünüyor, başkasının eline geçerse
   * bile başkasının dosyasını açmaz.
   */
  getSheets(userId: string, id: string): SheetData[] | undefined {
    this.sweep();
    const record = this.prepared.get(id);
    if (!record || record.userId !== userId) return undefined;
    return record.sheets;
  }

  /** Sohbetten bırakılan eklerin bellekteki izini siler. */
  releaseMany(userId: string, ids: string[]): void {
    for (const id of ids) this.discard(userId, id);
  }

  private async prepare(
    userId: string,
    buffer: Buffer,
    name: string,
    declaredMime: string,
    conversationId?: string
  ): Promise<AttachmentSummary> {
    this.sweep();

    const mimeType = effectiveMime(declaredMime, name);
    const kind = this.detectKind(mimeType, name);
    this.assertSize(kind, buffer.length, name);

    const record: PreparedAttachment = {
      id: randomUUID(),
      userId,
      name,
      mimeType,
      sizeBytes: buffer.length,
      kind,
      detail: humanSize(buffer.length),
      creditsCharged: 0,
      createdAt: Date.now(),
    };

    switch (kind) {
      case "image":
        record.base64 = buffer.toString("base64");
        record.detail = `Görsel · ${humanSize(buffer.length)}`;
        break;

      case "pdf":
        record.base64 = buffer.toString("base64");
        record.detail = `PDF · ${humanSize(buffer.length)}`;
        break;

      case "document": {
        record.text = this.clip(await this.readDocument(buffer, name));
        record.detail = `Word · ${this.wordCount(record.text)} kelime`;
        break;
      }

      case "sheet": {
        const { text, detail, sheets } = await this.readSheet(buffer, mimeType, name);
        record.text = text;
        record.detail = detail;
        record.sheets = sheets;
        break;
      }

      case "text":
        record.text = this.clip(buffer.toString("utf8").trim());
        record.detail = `Metin · ${this.wordCount(record.text)} kelime`;
        break;

      case "audio": {
        // Çözümleme ücretli ve dosya uzadıkça pahalanıyor. Bakiye yetmiyorsa
        // İŞLEM HİÇ YAPILMAZ: aksi halde kullanıcı istemediği bir borcun altına girer.
        // Süre ancak çözümlemeden sonra bilindiği için tahmin dosya boyutundan yapılır.
        const balance = await this.creditsService.assertCanStart(userId);
        this.creditsService.assertBalanceCovers(balance, estimateTranscriptionCredits(buffer.length));

        const result = await this.transcription.transcribe(buffer, name, mimeType);
        record.text = this.clip(result.text);
        // Ücret burada düşülür: çözümleme yapıldı, maliyet oluştu. Kullanıcı mesajı
        // hiç göndermese bile bedeli ödenmiş olur.
        const { credits } = await this.creditsService.chargeTranscription({
          userId,
          durationSeconds: result.durationSeconds,
          fileName: name,
          conversationId,
        });
        record.creditsCharged = credits;
        record.detail = `Ses · ${humanDuration(result.durationSeconds)}`;
        break;
      }
    }

    if (!record.text && !record.base64) {
      throw new BadRequestException(`"${name}" içinden okunabilir bir içerik çıkmadı.`);
    }

    this.prepared.set(record.id, record);
    this.logger.log(
      `Ek hazırlandı · kullanıcı=${userId.slice(0, 8)}… tür=${kind} ad=${name} ` +
        `boyut=${buffer.length} kredi=${record.creditsCharged}`
    );
    return this.toSummary(record);
  }

  toSummary(record: PreparedAttachment): AttachmentSummary {
    return {
      id: record.id,
      name: record.name,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      kind: record.kind,
      detail: record.detail,
      creditsCharged: record.creditsCharged,
    };
  }

  private detectKind(mimeType: string, name: string): AttachmentKind {
    if (IMAGE_MIMES.has(mimeType)) return "image";
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType === DOCX_MIME) return "document";
    if (mimeType === XLSX_MIME || mimeType === "text/csv") return "sheet";
    if (mimeType.startsWith("audio/") || mimeType === "video/mp4" || mimeType === "video/webm") return "audio";
    if (mimeType.startsWith("text/") || mimeType === "application/json") return "text";

    // Sık karşılaşılan ama okunamayan türler için ne yapılacağını söyleyen hatalar:
    // "desteklenmiyor" demek kullanıcıyı çıkmaza sokuyor.
    if (mimeType === "application/msword") {
      throw new BadRequestException("Eski Word biçimi (.doc) okunamıyor. Dosyayı .docx olarak kaydedip tekrar dene.");
    }
    if (mimeType === "application/vnd.ms-excel") {
      throw new BadRequestException("Eski Excel biçimi (.xls) okunamıyor. Dosyayı .xlsx olarak kaydedip tekrar dene.");
    }
    if (mimeType.startsWith("image/")) {
      throw new BadRequestException(
        `Bu görsel biçimi (${mimeType}) okunamıyor. JPEG, PNG, GIF ya da WebP olarak kaydedip tekrar dene.`
      );
    }
    throw new BadRequestException(`"${name}" türünü (${mimeType}) okuyamıyorum.`);
  }

  private assertSize(kind: AttachmentKind, bytes: number, name: string): void {
    const limits: Record<AttachmentKind, number> = {
      image: MAX_IMAGE_BYTES,
      pdf: MAX_PDF_BYTES,
      audio: MAX_AUDIO_BYTES,
      document: MAX_DOCUMENT_BYTES,
      sheet: MAX_DOCUMENT_BYTES,
      text: MAX_DOCUMENT_BYTES,
    };
    const limit = limits[kind];
    if (bytes > limit) {
      throw new BadRequestException(`"${name}" çok büyük (${humanSize(bytes)}). Bu tür için sınır ${humanSize(limit)}.`);
    }
  }

  private async readSheet(
    buffer: Buffer,
    mimeType: string,
    name: string
  ): Promise<{ text: string; detail: string; sheets: SheetData[] }> {
    if (mimeType === "text/csv") {
      const rows = parseCsv(buffer.toString("utf8"));
      const sheet: SheetData = {
        name: name.replace(/\.[^.]+$/, "") || "CSV",
        rows: rows.slice(0, MAX_RETAINED_ROWS),
        truncated: rows.length > MAX_RETAINED_ROWS,
      };
      if (!sheet.rows.length) throw new BadRequestException(`"${name}" içinde dolu bir satır bulunamadı.`);
      return {
        text: this.sheetText([sheet]),
        detail: `CSV · ${rows.length} satır`,
        sheets: [sheet],
      };
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch (error) {
      // ExcelJS her xlsx'i açamıyor. Açamadığında da düzgün bir hata atmıyor:
      // `xl/workbook.xml`'i ayrıştıramadığında geriye `undefined` dönüyor ve
      // kütüphane kendi içinde "Cannot read properties of undefined (reading
      // 'sheets')" diye patlıyor (canlıda görüldü). Ham TypeError genel hata
      // filtresine düşüp kullanıcıya "Beklenmeyen bir hata oluştu" dedirtiyordu:
      // ne olduğu da, ne yapacağı da belirsiz. Sebep dosyanın kendisi, sunucu
      // değil — bu yüzden 400 ve yapılabilir bir öneri döner.
      throw this.okunamadi("Excel", name, buffer.length, error);
    }

    // SATIRLAR SUNUCUDA KALIR. Eskiden burada doğrudan modele gidecek metin
    // örülüyordu ve 400 satırda kesiliyordu; artık satırlar saklanıyor, modele
    // giden metin bunlardan türetiliyor (bkz. sheetText).
    const sheets: SheetData[] = [];
    let totalRows = 0;
    workbook.eachSheet((sheet) => {
      const rows: string[][] = [];
      let kesildi = false;
      sheet.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length >= MAX_RETAINED_ROWS) {
          kesildi = true;
          return;
        }
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        const cells = values.map(cellText);
        // Tamamen boş satır ne saklanır ne gönderilir.
        if (cells.every((cell) => cell === "")) return;
        rows.push(cells);
      });
      if (!rows.length) return;
      totalRows += rows.length;
      sheets.push({ name: sheet.name, rows, truncated: kesildi || undefined });
    });

    if (totalRows === 0) throw new BadRequestException(`"${name}" içinde dolu bir satır bulunamadı.`);
    return {
      text: this.sheetText(sheets),
      detail: `Excel · ${sheets.length} sayfa · ${totalRows} satır`,
      sheets,
    };
  }

  /**
   * Tablonun modele GİDEN hâli.
   *
   * Küçük tablo bugünkü gibi olduğu gibi gider: birkaç satırlık bir liste için
   * modeli read_sheet çağırmaya zorlamak fazladan bir tur (ve fazladan kredi)
   * demekti. Büyük tabloda ise yalnızca künye gider — başlıklar, satır sayısı ve
   * birkaç örnek satır — gerisini içe aktarma araçları sunucudan okur.
   */
  private sheetText(sheets: SheetData[]): string {
    const tamami = sheets
      .map((sheet) => [`## Sayfa: ${sheet.name}`, ...sheet.rows.map((row) => row.join(" | ")), ""].join("\n"))
      .join("\n")
      .trim();
    if (tamami.length <= INLINE_SHEET_CHARS && !sheets.some((s) => s.truncated)) return tamami;
    return buildSheetSummary(sheets);
  }

  /**
   * Word metnini çıkarır.
   *
   * mammoth bozuk ya da .docx sanılan (ör. adı değiştirilmiş) bir dosyada ham
   * hata fırlatıyor; readSheet'teki gerekçeyle burada da anlamlı bir 400'e çevrilir.
   */
  private async readDocument(buffer: Buffer, name: string): Promise<string> {
    try {
      const { value } = await mammoth.extractRawText({ buffer });
      return value.trim();
    } catch (error) {
      throw this.okunamadi("Word", name, buffer.length, error);
    }
  }

  /**
   * Ayrıştırılamayan dosya için kullanıcıya dönecek hata.
   *
   * Asıl teknik sebep YALNIZCA log'a yazılır: kullanıcıya faydası yok, ama aynı
   * dosya bir daha geldiğinde sebebi aramak yerine log'dan okumak gerekiyor
   * (bu hata ilk kez "Beklenmeyen bir hata oluştu" olarak geldiğinde sebebi
   * bulmak sunucu log'una bakmayı gerektirdi).
   */
  private okunamadi(tur: string, name: string, bytes: number, error: unknown): BadRequestException {
    this.logger.warn(
      `${tur} dosyası okunamadı · ad=${name} boyut=${bytes} · ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`
    );
    return new BadRequestException(
      `"${name}" bir ${tur} dosyası olarak açılamadı — içeriği bozuk ya da bu biçimi okuyamıyorum. ` +
        `Dosyayı ${tur === "Excel" ? "Excel ya da Google E-Tablolar'da açıp .xlsx" : "Word'de açıp .docx"} ` +
        `olarak yeniden kaydedip tekrar dene.`
    );
  }

  private clip(text: string): string {
    if (text.length <= MAX_TEXT_CHARS) return text;
    return `${text.slice(0, MAX_TEXT_CHARS)}\n… [dosyanın devamı kısaltıldı; tamamı için daha dar bir bölüm sor]`;
  }

  private wordCount(text?: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, record] of this.prepared) {
      // Saklamaya alınmış ekler kendi süresine, ötekiler hazırlanma anına göre düşer.
      const expired = record.retainedUntil
        ? now > record.retainedUntil
        : now - record.createdAt > ATTACHMENT_TTL_MS;
      if (expired) this.prepared.delete(id);
    }
  }
}
