import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { BLANK_DOCX_BASE64, BLANK_PPTX_BASE64, BLANK_XLSX_BASE64 } from "./office-templates";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

/** createNativeFile için desteklenen boş Office şablonları — office-templates.ts'teki base64 ikililerden üretilir. */
export const ONEDRIVE_NATIVE_TEMPLATES: Record<
  "docx" | "xlsx" | "pptx",
  { base64: string; mimeType: string; extension: string }
> = {
  docx: {
    base64: BLANK_DOCX_BASE64,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
  xlsx: {
    base64: BLANK_XLSX_BASE64,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  },
  pptx: {
    base64: BLANK_PPTX_BASE64,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: "pptx",
  },
};

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
}

/** OneDrive dosyası bulunamadı/erişilemiyor. drive.service.ts'teki DriveFileMissingError ile aynı rol. */
export class OneDriveFileMissingError extends NotFoundException {
  constructor(itemId: string) {
    super(`Dosya OneDrive'da bulunamadı (${itemId}). OneDrive üzerinden silinmiş olabilir.`);
  }
}

/** Klasörler için Graph'ın "folder" facet'i; dosyalar için "file" facet'i döner. */
function mapItem(json: any): DriveFile {
  return {
    id: json.id,
    name: json.name,
    // OneDrive'da klasörlerin mimeType'ı olmaz; Google'daki FOLDER_MIME'a
    // benzer sabit bir değerle temsil ediyoruz ki çağıran taraf ayrım
    // yapabilsin.
    mimeType: json.folder ? FOLDER_MIME : json.file?.mimeType || "application/octet-stream",
    size: json.size !== undefined ? Number(json.size) : undefined,
    webViewLink: json.webUrl ?? undefined,
    iconLink: json.thumbnails?.[0]?.small?.url ?? undefined,
    md5Checksum: json.file?.hashes?.quickXorHash ?? undefined,
    trashed: json.deleted !== undefined,
    // Graph'ta tek ebeveyn var; Google ile aynı şekli taşısın diye diziye alınıyor.
    parentIds: json.parentReference?.id ? [json.parentReference.id as string] : undefined,
  };
}

export const FOLDER_MIME = "application/vnd.projelio.folder";

/**
 * Microsoft Graph OneDrive API sarmalayıcısı — drive.service.ts'in OneDrive
 * karşılığı. Tıpkı orada olduğu gibi resmi SDK yerine doğrudan fetch kullanıyoruz;
 * bize yalnızca bir avuç uç nokta gerekiyor.
 *
 * Bütün işlemler `Files.ReadWrite.AppFolder` scope'u ile uygulamanın kendi
 * özel klasörü (/me/drive/special/approot) altında yapılır — parentId'siz bir
 * çağrı geldiğinde bu klasöre düşer.
 */
@Injectable()
export class OneDriveService {
  private readonly logger = new Logger(OneDriveService.name);

  private async call<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchWithTimeout(`${GRAPH_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) throw new OneDriveFileMissingError(path);
      if (res.status === 507 || (res.status === 403 && body.includes("quota"))) {
        throw new BadRequestException(
          "OneDrive depolama alanı dolu. Yer açın veya depolama planınızı yükseltin."
        );
      }
      this.logger.error(`Graph API hatası ${res.status} ${path}: ${body}`);
      throw new BadRequestException(`OneDrive isteği başarısız (${res.status}).`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ------------------------------------------------------------------ klasörler

  /** Uygulamanın özel kök klasörü ("Apps/Projelio" benzeri). Google'daki "Projelio" kök klasörünün karşılığı. */
  async getAppRootFolder(accessToken: string): Promise<DriveFile> {
    const json = await this.call<any>(accessToken, "/me/drive/special/approot");
    return mapItem(json);
  }

  async createFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile> {
    const parent = parentId ?? (await this.getAppRootFolder(accessToken)).id;
    const json = await this.call<any>(accessToken, `/me/drive/items/${parent}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    });
    return mapItem(json);
  }

  /**
   * Kök (ya da verilen parent) altında isme göre klasör arar, yoksa oluşturur.
   *
   * Graph'ın $filter'ı klasör/dosya ayrımını her zaman güvenilir desteklemediği
   * için (bkz. Microsoft Graph bilinen sınırlamaları), alt öğeleri listeleyip
   * istemci tarafında eşliyoruz. AppFolder scope'u altındaki klasör sayısı
   * (iş/departman başına birkaç tane) bunun için fazlasıyla küçük.
   */
  async findOrCreateFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile> {
    const parent = parentId ?? (await this.getAppRootFolder(accessToken)).id;

    const children = await this.call<any>(
      accessToken,
      `/me/drive/items/${parent}/children?$select=id,name,folder,file,size,webUrl`
    );
    const match = (children?.value ?? []).find((c: any) => c.folder && c.name === name);
    if (match) return mapItem(match);

    return this.createFolder(accessToken, name, parent);
  }

  async renameFile(accessToken: string, itemId: string, name: string): Promise<DriveFile> {
    const json = await this.call<any>(accessToken, `/me/drive/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return mapItem(json);
  }

  // ------------------------------------------------------------------- yükleme

  /** Küçük dosyalar (<4MB) için tek istekli yükleme. */
  async uploadMultipart(
    accessToken: string,
    meta: { name: string; mimeType: string; parentId?: string },
    content: Buffer
  ): Promise<DriveFile> {
    const parent = meta.parentId ?? (await this.getAppRootFolder(accessToken)).id;
    const safeName = encodeURIComponent(meta.name);

    const json = await this.call<any>(
      accessToken,
      `/me/drive/items/${parent}:/${safeName}:/content`,
      {
        method: "PUT",
        headers: { "Content-Type": meta.mimeType },
        body: content as unknown as BodyInit,
      }
    );
    return mapItem(json);
  }

  /**
   * Büyük dosyalar için yükleme oturumu açar.
   *
   * Google'ın "resumable session" akışının Graph karşılığı: dönen `uploadUrl`'e
   * tarayıcı parça parça (320 KiB'ın katları) PUT eder, backend'in belleğinden
   * geçmez. Ara parçalarda 202, son parçada tamamlanan DriveItem JSON'ı döner.
   */
  async createResumableSession(
    accessToken: string,
    meta: { name: string; mimeType: string; parentId?: string; sizeBytes?: number }
  ): Promise<string> {
    const parent = meta.parentId ?? (await this.getAppRootFolder(accessToken)).id;
    const safeName = encodeURIComponent(meta.name);

    const json = await this.call<any>(
      accessToken,
      `/me/drive/items/${parent}:/${safeName}:/createUploadSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: { "@microsoft.graph.conflictBehavior": "rename", name: meta.name },
        }),
      }
    );

    if (!json?.uploadUrl) throw new BadRequestException("OneDrive yükleme oturumu açılamadı.");
    return json.uploadUrl as string;
  }

  /**
   * Yarım kalan bir yükleme oturumunun durumu (bkz. DriveService.resumableStatus
   * — aynı sorun, farklı protokol).
   *
   * Graph'ta oturum GET ile sorgulanıyor. Dosya tamamlandığında oturum ARTIK
   * YOKTUR, yani 404 iki anlama gelir: "süresi doldu" ya da "bitti". Bu ayrımı
   * burada yapamıyoruz; çağıran taraf hedef klasöre bakarak karar veriyor
   * (bkz. FilesService.reconcileUploadSession).
   */
  async resumableStatus(
    uploadUrl: string
  ): Promise<{ state: "incomplete"; receivedBytes: number } | { state: "gone" }> {
    const res = await fetchWithTimeout(uploadUrl, { method: "GET" }).catch(() => null);
    if (!res || !res.ok) return { state: "gone" };

    const json = await res.json().catch(() => null);
    const next: string | undefined = json?.nextExpectedRanges?.[0];
    return { state: "incomplete", receivedBytes: next ? Number(next.split("-")[0]) : 0 };
  }

  /** Yükleme oturumunu iptal eder; iptal edilmezse oturum bir süre daha yaşar. */
  async cancelResumable(uploadUrl: string): Promise<void> {
    await fetchWithTimeout(uploadUrl, { method: "DELETE" }).catch(() => undefined);
  }

  // ------------------------------------------------------------------- okuma

  async getFile(accessToken: string, itemId: string): Promise<DriveFile> {
    const json = await this.call<any>(accessToken, `/me/drive/items/${itemId}`);
    return mapItem(json);
  }

  /**
   * Dosya içeriğini ham Response olarak döndürür.
   *
   * Graph, `/content` uç noktasında imzalı, kimlik doğrulaması gerektirmeyen
   * bir indirme adresine 302 ile yönlendirir; Node'un global `fetch`'i
   * yönlendirmeleri otomatik takip ettiği için tek çağrı yeterli — Google'daki
   * `alt=media` ile aynı basitlikte.
   *
   * OneDrive'da Google Dokümanlar'a karşılık gelen "sanal, ikili içeriği
   * olmayan" bir format yok (Word/Excel/PowerPoint dosyaları OneDrive'da her
   * zaman gerçek .docx/.xlsx/.pptx ikilileridir); bu yüzden export mantığına
   * gerek yok.
   */
  async downloadResponse(accessToken: string, itemId: string): Promise<Response> {
    const res = await fetchWithTimeout(`${GRAPH_API}/me/drive/items/${itemId}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 404) throw new OneDriveFileMissingError(itemId);
      const body = await res.text();
      this.logger.error(`OneDrive indirme hatası ${res.status}: ${body}`);
      throw new BadRequestException("Dosya OneDrive'dan indirilemedi.");
    }
    return res;
  }

  async getQuota(accessToken: string): Promise<DriveQuota> {
    const json = await this.call<any>(accessToken, "/me/drive?$select=quota");
    const q = json?.quota ?? {};
    return {
      limitBytes: q.total !== undefined ? Number(q.total) : undefined,
      usageBytes: q.used !== undefined ? Number(q.used) : undefined,
    };
  }

  // ---------------------------------------------------------------- paylaşım

  /**
   * Klasöre (ya da dosyaya) bir e-posta için izin verir.
   *
   * drive.service.ts'teki grantPermission ile aynı gerekçe: izin klasörden alt
   * öğelere miras alınır, proje kök klasörüne bir kez izin vermek yeterli olur.
   * `sendInvitation: false` — kullanıcı Projelio'da zaten üye, ayrıca Microsoft'tan
   * bildirim e-postası almasına gerek yok.
   */
  async grantPermission(
    accessToken: string,
    itemId: string,
    email: string,
    role: "reader" | "writer"
  ): Promise<{ permissionId: string }> {
    const json = await this.call<any>(accessToken, `/me/drive/items/${itemId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipients: [{ email }],
        roles: [role === "writer" ? "write" : "read"],
        requireSignIn: true,
        sendInvitation: false,
      }),
    });
    const permissionId = json?.value?.[0]?.id;
    if (!permissionId) throw new BadRequestException("OneDrive izni oluşturulamadı.");
    return { permissionId };
  }

  async revokePermission(accessToken: string, itemId: string, permissionId: string): Promise<void> {
    try {
      await this.call(accessToken, `/me/drive/items/${itemId}/permissions/${permissionId}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (error instanceof OneDriveFileMissingError) return;
      throw error;
    }
  }

  // ------------------------------------------------------------- göz atma / içe aktarma
  //
  // Aşağıdaki üç metot yalnızca `Files.Read.All` (bkz. ONEDRIVE_BROWSE_SCOPE,
  // microsoft-oauth.service.ts) sayesinde mümkün — kullanıcının OneDrive'ının
  // tamamını (uygulama klasörünün dışını da) kapsar. Google tarafında bunun
  // karşılığı yok çünkü orada Picker widget'ı kullanılıyor (bkz. drive.service.ts
  // üstündeki açıklama).

  /**
   * Bir klasörün alt öğelerini listeler. `folderId` verilmezse OneDrive'ın
   * kökünden ("Dosyalarım") başlar — uygulamanın özel klasörüyle sınırlı
   * olan getAppRootFolder'ın aksine burada amaç kullanıcının tüm Drive'ında
   * gezinebilmek.
   */
  async listFiles(accessToken: string, folderId?: string): Promise<DriveFile[]> {
    const path = folderId
      ? `/me/drive/items/${folderId}/children?$select=id,name,folder,file,size,webUrl&$orderby=folder desc,name`
      : `/me/drive/root/children?$select=id,name,folder,file,size,webUrl&$orderby=folder desc,name`;
    const json = await this.call<any>(accessToken, path);
    return ((json?.value ?? []) as any[]).map(mapItem);
  }

  /**
   * Var olan bir OneDrive öğesini (kullanıcının Drive'ının herhangi bir
   * yerinden) belirtilen hedef klasöre kopyalar — "Drive'dan seç" akışında
   * seçilen dosyayı Projelio'nun kendi klasörüne (approot altına) almak için.
   *
   * Graph'ın copy uç noktası ASENKRON çalışır: 202 Accepted ile birlikte bir
   * "monitor" URL'i döner, biz de kopyalama tamamlanana kadar bu URL'i kısa
   * aralıklarla yoklarız (Google'ın senkron /files/copy'sinden farklı).
   */
  async copyFile(
    accessToken: string,
    itemId: string,
    destParentId: string,
    newName?: string
  ): Promise<DriveFile> {
    const res = await fetchWithTimeout(`${GRAPH_API}/me/drive/items/${itemId}/copy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify({
        parentReference: { id: destParentId },
        ...(newName ? { name: newName } : {}),
      }),
    });

    if (res.status === 404) throw new OneDriveFileMissingError(itemId);
    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`OneDrive kopyalama başlatılamadı ${res.status}: ${body}`);
      throw new BadRequestException("Dosya OneDrive içinde kopyalanamadı.");
    }

    const monitorUrl = res.headers.get("Location");
    if (!monitorUrl) {
      // Bazı durumlarda Graph küçük dosyaları senkron tamamlayıp doğrudan
      // öğeyi döndürebiliyor.
      const json = await res.json().catch(() => null);
      if (json?.id) return mapItem(json);
      throw new BadRequestException("Dosya OneDrive içinde kopyalanamadı (izleme adresi alınamadı).");
    }

    // 20 x 500ms ~= 10 saniye üst sınır; çoğu dosya için kopyalama çok daha
    // hızlı tamamlanır.
    for (let attempt = 0; attempt < 20; attempt++) {
      const statusRes = await fetchWithTimeout(monitorUrl);
      const statusJson = await statusRes.json().catch(() => null);
      if (statusJson?.status === "completed" && statusJson?.resourceId) {
        return this.getFile(accessToken, statusJson.resourceId);
      }
      if (statusJson?.status === "failed") {
        throw new BadRequestException("Dosya OneDrive içinde kopyalanamadı.");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new BadRequestException("Dosya kopyalama zaman aşımına uğradı, lütfen tekrar deneyin.");
  }

  /**
   * Boş bir Word/Excel/PowerPoint dosyası oluşturur (office-templates.ts'teki
   * hazır şablon baytlarını yükleyerek — Graph'ta yalnızca meta veriyle boş bir
   * Office dosyası oluşturmanın bir yolu yok, Google Dokümanlar'ın aksine
   * OneDrive'da "sanal" doküman türü bulunmuyor).
   */
  async createNativeFile(
    accessToken: string,
    kind: "docx" | "xlsx" | "pptx",
    name: string,
    parentId?: string
  ): Promise<DriveFile> {
    const template = ONEDRIVE_NATIVE_TEMPLATES[kind];
    const fileName = name.toLowerCase().endsWith(`.${template.extension}`) ? name : `${name}.${template.extension}`;
    const content = Buffer.from(template.base64, "base64");
    return this.uploadMultipart(accessToken, { name: fileName, mimeType: template.mimeType, parentId }, content);
  }

  // ------------------------------------------------------------------- silme

  /** Öğeyi Geri Dönüşüm Kutusu'na taşır (kalıcı silmez) — drive.service.ts'teki trashFile ile aynı davranış. */
  async trashFile(accessToken: string, itemId: string): Promise<void> {
    try {
      await this.call(accessToken, `/me/drive/items/${itemId}`, { method: "DELETE" });
    } catch (error) {
      if (error instanceof OneDriveFileMissingError) return;
      throw error;
    }
  }
}
