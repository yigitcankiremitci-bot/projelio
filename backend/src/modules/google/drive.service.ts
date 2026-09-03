import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Google'ın kendi formatları. Bunların ikili içeriği yoktur: alt=media ile
 * indirilmezler, files.export ile başka bir formata çevrilmeleri gerekir.
 */
export const GOOGLE_DOC_EXPORT_MIME: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: "pptx",
  },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: "png" },
  "application/vnd.google-apps.script": { mime: "application/vnd.google-apps.script+json", ext: "json" },
};

export function isGoogleDocMime(mime: string): boolean {
  return mime.startsWith("application/vnd.google-apps.") && mime !== FOLDER_MIME;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
  iconLink?: string;
  md5Checksum?: string;
  trashed?: boolean;
  /** Dosyanın içinde bulunduğu klasör(ler) — bkz. CloudFile.parentIds. */
  parentIds?: string[];
}

export interface DriveQuota {
  limitBytes?: number;
  usageBytes?: number;
  usageInDriveBytes?: number;
}

/**
 * "Yeni dosya oluştur" menüsünde seçilebilecek Google'a özgü doküman türleri.
 *
 * Google Drive'da göz atma/seçme, OneDrive'dan farklı olarak kendi backend
 * uç noktamızla değil, Google'ın resmi Picker penceresiyle yapılır (bkz.
 * frontend GooglePickerButton) — bu yüzden burada OneDriveService'teki gibi
 * bir `listFiles` yok; yalnızca Picker'ın seçtiği dosyayı kopyalayan
 * `copyFile` ve yeni boş doküman oluşturan `createNativeFile` var.
 */
export const GOOGLE_NATIVE_MIME: Record<"gdoc" | "gsheet" | "gslide", string> = {
  gdoc: "application/vnd.google-apps.document",
  gsheet: "application/vnd.google-apps.spreadsheet",
  gslide: "application/vnd.google-apps.presentation",
};

const FILE_FIELDS = "id,name,mimeType,size,webViewLink,iconLink,md5Checksum,trashed,parents";

function mapFile(json: any): DriveFile {
  return {
    id: json.id,
    name: json.name,
    mimeType: json.mimeType,
    size: json.size !== undefined ? Number(json.size) : undefined,
    webViewLink: json.webViewLink ?? undefined,
    iconLink: json.iconLink ?? undefined,
    md5Checksum: json.md5Checksum ?? undefined,
    trashed: json.trashed ?? undefined,
    parentIds: Array.isArray(json.parents) ? json.parents : undefined,
  };
}

/** Drive dosyası bulunamadı/erişilemiyor. Çağıran taraf kaydı 'missing' işaretler. */
export class DriveFileMissingError extends NotFoundException {
  constructor(fileId: string) {
    super(`Dosya Google Drive'da bulunamadı (${fileId}). Drive üzerinden silinmiş olabilir.`);
  }
}

/**
 * Google Drive REST API sarmalayıcısı.
 *
 * `googleapis` paketi yerine doğrudan fetch kullanılıyor: paket 50 MB'ın üzerinde
 * ve tüm Google servislerini içeriyor; bize yalnızca Drive'ın bir avuç uç noktası
 * gerekiyor. Node 20+ global fetch sağlıyor, ek bağımlılık yok.
 */
@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);

  private async call<T>(
    accessToken: string,
    path: string,
    init: RequestInit = {},
    base = DRIVE_API
  ): Promise<T> {
    const res = await fetchWithTimeout(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) throw new DriveFileMissingError(path);
      if (res.status === 403 && body.includes("storageQuotaExceeded")) {
        throw new BadRequestException(
          "Google Drive depolama alanı dolu. Yer açın veya depolama planınızı yükseltin."
        );
      }
      this.logger.error(`Drive API hatası ${res.status} ${path}: ${body}`);
      throw new BadRequestException(`Google Drive isteği başarısız (${res.status}).`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ------------------------------------------------------------------ klasörler

  async createFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile> {
    const json = await this.call<any>(accessToken, `/files?fields=${FILE_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    return mapFile(json);
  }

  /**
   * Kök "Projelio" klasörünü bulur ya da oluşturur.
   *
   * Not: `drive.file` scope'u yalnızca uygulamanın kendi oluşturduğu dosyaları
   * görebildiği için bu arama kullanıcının diğer klasörlerini taramaz — sadece
   * bizim daha önce oluşturduğumuz klasörü bulur.
   */
  async findOrCreateFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile> {
    const clauses = [
      `mimeType='${FOLDER_MIME}'`,
      `name='${name.replace(/'/g, "\\'")}'`,
      "trashed=false",
      parentId ? `'${parentId}' in parents` : "'root' in parents",
    ];
    const q = encodeURIComponent(clauses.join(" and "));

    const found = await this.call<any>(
      accessToken,
      `/files?q=${q}&fields=files(${FILE_FIELDS})&pageSize=1`
    );
    if (found?.files?.length) return mapFile(found.files[0]);

    return this.createFolder(accessToken, name, parentId);
  }

  async renameFile(accessToken: string, fileId: string, name: string): Promise<DriveFile> {
    const json = await this.call<any>(accessToken, `/files/${fileId}?fields=${FILE_FIELDS}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return mapFile(json);
  }

  // ------------------------------------------------------- göz atma / içe aktarma
  //
  // `drive.file` scope'u normalde yalnızca uygulamanın oluşturduğu dosyaları
  // görür — ama kullanıcı Picker penceresinden (bkz. frontend GooglePickerButton)
  // bir dosya seçtiğinde Google, seçilen dosya için otomatik olarak kalıcı erişim
  // verir. copyFile bu seçilen dosyayı Projelio'nun kendi klasörüne kopyalar;
  // scope genişletmeye hiç gerek kalmaz (bkz. google-oauth.service.ts DRIVE_SCOPE).

  /** Picker'da seçilen dosyayı hedef klasöre kopyalar — orijinali kullanıcının Drive'ında kalır. */
  async copyFile(accessToken: string, fileId: string, destParentId: string, newName?: string): Promise<DriveFile> {
    const json = await this.call<any>(accessToken, `/files/${fileId}/copy?fields=${FILE_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parents: [destParentId], ...(newName ? { name: newName } : {}) }),
    });
    return mapFile(json);
  }

  /**
   * Yeni boş bir Google Dokümanlar/E-Tablolar/Sunular dosyası oluşturur.
   *
   * Google, bu native mimeType'lar için içerik yüklemeden boş bir dosya
   * oluşturabiliyor — OneDrive'daki karşılığından (bkz. OneDriveService) farkı bu.
   */
  async createNativeFile(accessToken: string, name: string, mimeType: string, parentId: string): Promise<DriveFile> {
    const json = await this.call<any>(accessToken, `/files?fields=${FILE_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType, parents: [parentId] }),
    });
    return mapFile(json);
  }

  // ------------------------------------------------------------------- yükleme

  /** Küçük dosyalar için tek istekli multipart yükleme. */
  async uploadMultipart(
    accessToken: string,
    meta: { name: string; mimeType: string; parentId?: string },
    content: Buffer
  ): Promise<DriveFile> {
    const boundary = `projelio-${Date.now().toString(16)}`;
    const metadata = JSON.stringify({
      name: meta.name,
      ...(meta.parentId ? { parents: [meta.parentId] } : {}),
    });

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const json = await this.call<any>(
      accessToken,
      `/files?uploadType=multipart&fields=${FILE_FIELDS}`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body: body as unknown as BodyInit,
      },
      DRIVE_UPLOAD_API
    );
    return mapFile(json);
  }

  /**
   * Büyük dosyalar için "resumable" yükleme oturumu açar.
   *
   * Dönen URI'ye tarayıcı doğrudan yükleme yapar; içerik backend'in belleğinden
   * ve bant genişliğinden geçmez. Bağlantı koparsa aynı URI ile kaldığı yerden
   * devam edilebilir.
   */
  async createResumableSession(
    accessToken: string,
    meta: { name: string; mimeType: string; parentId?: string; sizeBytes?: number }
  ): Promise<string> {
    const res = await fetchWithTimeout(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": meta.mimeType,
        ...(meta.sizeBytes ? { "X-Upload-Content-Length": String(meta.sizeBytes) } : {}),
      },
      body: JSON.stringify({
        name: meta.name,
        ...(meta.parentId ? { parents: [meta.parentId] } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Resumable oturum açılamadı (${res.status}): ${body}`);
      throw new BadRequestException("Google Drive yükleme oturumu açılamadı.");
    }

    const location = res.headers.get("location");
    if (!location) throw new BadRequestException("Google Drive yükleme adresi alınamadı.");
    return location;
  }

  /**
   * Yarım kalan bir resumable oturumun DURUMU.
   *
   * NEDEN GEREKLİ: dosya, son parça Drive'a ulaştığı anda Drive'da OLUŞUYOR;
   * Projelio ise ancak tarayıcı `/complete` çağrısını yapabilirse haberdar
   * oluyor. Arada bağlantı koparsa (ya da sekme arka planda uyutulursa) dosya
   * Drive'da kalıyor, Projelio'da hiç görünmüyor — kullanıcı iki yerde iki
   * farklı gerçek görüyor ve elinde düzeltecek bir şey yok.
   *
   * Bu sorgu resumable protokolün kendi kurtarma yolu: gövdesiz bir PUT ile
   * "nerede kalmıştık" diye soruluyor. 308 = yarım, 200/201 = dosya oluşmuş.
   */
  async resumableStatus(
    uploadUrl: string,
    sizeBytes?: number
  ): Promise<
    | { state: "complete"; fileId: string }
    | { state: "incomplete"; receivedBytes: number }
    | { state: "gone" }
  > {
    const res = await fetchWithTimeout(uploadUrl, {
      method: "PUT",
      // "*" = gövde göndermiyorum, yalnızca durumu soruyorum. Toplam boyut
      // bilinmiyorsa da "*" geçerli.
      headers: { "Content-Range": `bytes */${sizeBytes ?? "*"}` },
    });

    if (res.status === 308) {
      const range = res.headers.get("range");
      return { state: "incomplete", receivedBytes: range ? Number(range.split("-")[1]) + 1 : 0 };
    }

    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.id) return { state: "complete", fileId: json.id as string };
      // Dosya oluştu ama kimliğini alamadık; yarım saymak yanlış olur.
      return { state: "gone" };
    }

    // 404/410: oturumun süresi dolmuş ya da iptal edilmiş.
    return { state: "gone" };
  }

  /**
   * Resumable oturumu iptal eder.
   *
   * Yalnızca satırı silmek yetmiyor: iptal edilmeyen oturum Drive tarafında
   * bir hafta boyunca yaşıyor ve o süre içinde tamamlanabiliyor. Kullanıcı
   * "vazgeç" dedikten sonra dosyanın Drive'da belirmesi tam olarak buydu.
   */
  async cancelResumable(uploadUrl: string): Promise<void> {
    // Google iptalde standart dışı 499 dönüyor; hata saymıyoruz.
    await fetchWithTimeout(uploadUrl, { method: "DELETE", headers: { "Content-Length": "0" } }).catch(() => undefined);
  }

  // ------------------------------------------------------------------- okuma

  async getFile(accessToken: string, fileId: string): Promise<DriveFile> {
    const json = await this.call<any>(accessToken, `/files/${fileId}?fields=${FILE_FIELDS}`);
    return mapFile(json);
  }

  /**
   * Dosya içeriğini ham Response olarak döndürür; çağıran taraf gövdeyi istemciye
   * doğrudan aktarır. Bellekte tamponlanmaz, böylece büyük dosyalar da akar.
   */
  async downloadResponse(accessToken: string, fileId: string, mimeType: string): Promise<Response> {
    const exportAs = GOOGLE_DOC_EXPORT_MIME[mimeType];

    const url = exportAs
      ? `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportAs.mime)}`
      : `${DRIVE_API}/files/${fileId}?alt=media`;

    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!res.ok) {
      if (res.status === 404) throw new DriveFileMissingError(fileId);
      const body = await res.text();
      this.logger.error(`Drive indirme hatası ${res.status}: ${body}`);
      throw new BadRequestException("Dosya Google Drive'dan indirilemedi.");
    }
    return res;
  }

  async getQuota(accessToken: string): Promise<DriveQuota> {
    const json = await this.call<any>(accessToken, "/about?fields=storageQuota");
    const q = json?.storageQuota ?? {};
    return {
      // Sınırsız depolamalı Workspace hesaplarında `limit` alanı hiç gelmez.
      limitBytes: q.limit !== undefined ? Number(q.limit) : undefined,
      usageBytes: q.usage !== undefined ? Number(q.usage) : undefined,
      usageInDriveBytes: q.usageInDrive !== undefined ? Number(q.usageInDrive) : undefined,
    };
  }

  // ---------------------------------------------------------------- paylaşım

  /**
   * Klasöre (ya da dosyaya) bir e-posta için izin verir.
   *
   * İzin alt öğelere Drive tarafından miras alınır: proje kök klasörüne bir kez
   * izin vermek, o projedeki tüm dosyaları kapsar. Dosya başına izin vermek
   * yüzlerce gereksiz API çağrısı olurdu.
   *
   * sendNotificationEmail=false: kullanıcı Projelio'da zaten üye, ayrıca Google'dan
   * "sizinle bir klasör paylaşıldı" e-postası almasına gerek yok.
   */
  async grantPermission(
    accessToken: string,
    fileId: string,
    email: string,
    role: "reader" | "writer"
  ): Promise<{ permissionId: string }> {
    const json = await this.call<any>(
      accessToken,
      `/files/${fileId}/permissions?sendNotificationEmail=false&fields=id`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user", role, emailAddress: email }),
      }
    );
    return { permissionId: json.id };
  }

  async revokePermission(accessToken: string, fileId: string, permissionId: string): Promise<void> {
    try {
      await this.call(accessToken, `/files/${fileId}/permissions/${permissionId}`, { method: "DELETE" });
    } catch (error) {
      // İzin Drive tarafından zaten kaldırılmış olabilir; bu bir hata değil.
      if (error instanceof DriveFileMissingError) return;
      throw error;
    }
  }

  // ------------------------------------------------------------------- silme

  /**
   * Dosyayı çöp kutusuna taşır (kalıcı silmez).
   *
   * Kalıcı silme bilinçli ve geri alınamaz bir işlemdir; kullanıcının Drive'ındaki
   * verisini Projelio'daki bir "sil" tıklamasıyla yok etmek doğru olmaz. Çöp
   * kutusundan geri alma kullanıcının kontrolünde kalır.
   */
  async trashFile(accessToken: string, fileId: string): Promise<void> {
    try {
      await this.call(accessToken, `/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });
    } catch (error) {
      if (error instanceof DriveFileMissingError) return;
      throw error;
    }
  }
}
