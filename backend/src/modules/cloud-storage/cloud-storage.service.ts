import { Injectable } from "@nestjs/common";
import { DriveService, GOOGLE_DOC_EXPORT_MIME, isGoogleDocMime } from "../google/drive.service";
import { GoogleAccountsService } from "../google/google-accounts.service";
import { MicrosoftAccountsService } from "../microsoft/microsoft-accounts.service";
import { OneDriveService } from "../microsoft/onedrive.service";
import type { CloudAccount, CloudFile, ResolvedCloudAccount, StorageProvider } from "./cloud-storage.types";

export { GOOGLE_DOC_EXPORT_MIME, isGoogleDocMime };

/**
 * FilesService'in Google Drive'a VE OneDrive'a aynı çağrılarla konuşmasını
 * sağlayan cephe (facade).
 *
 * FilesService, bir işin/departmanın dosyalarının hangi sağlayıcıda olduğunu
 * (`storage_provider`) veritabanından okur ve bu servisin her metoduna ilk
 * parametre olarak geçer; bu sınıf çağrıyı doğru alt servise (Google ya da
 * Microsoft) yönlendirir. FilesService'in geri kalanı iki sağlayıcı
 * arasındaki farkla hiç uğraşmaz.
 */
@Injectable()
export class CloudStorageService {
  constructor(
    private googleAccounts: GoogleAccountsService,
    private googleDrive: DriveService,
    private msAccounts: MicrosoftAccountsService,
    private oneDrive: OneDriveService
  ) {}

  // ---------------------------------------------------------------- hesaplar

  /**
   * Kullanıcının kullanılabilir bir bulut hesabını bulur.
   *
   * Google ÖNCELİKLİDİR: Projelio'nun ilk (ve hâlâ en yaygın) sağlayıcısı Google
   * Drive olduğu için, her iki hesabı da bağlı kullanıcılarda mevcut davranış
   * değişmez. Kullanıcı yalnızca OneDrive bağladıysa (Google hiç bağlı değilse)
   * otomatik olarak OneDrive kullanılır — "aynı işlemi OneDrive ile de
   * yapabilme" tam olarak budur.
   */
  async findAccountForUser(userId: string): Promise<ResolvedCloudAccount | undefined> {
    const google = await this.googleAccounts.findByUserId(userId);
    if (this.googleAccounts.isDriveReady(google)) return { provider: "google", account: google };

    const microsoft = await this.msAccounts.findByUserId(userId);
    if (this.msAccounts.isDriveReady(microsoft)) return { provider: "microsoft", account: microsoft };

    return undefined;
  }

  async findById(provider: StorageProvider, accountId: string) {
    return provider === "google" ? this.googleAccounts.findById(accountId) : this.msAccounts.findById(accountId);
  }

  async findByUserId(provider: StorageProvider, userId: string) {
    return provider === "google"
      ? this.googleAccounts.findByUserId(userId)
      : this.msAccounts.findByUserId(userId);
  }

  async getAccessToken(provider: StorageProvider, accountId: string): Promise<string> {
    return provider === "google"
      ? this.googleAccounts.getAccessToken(accountId)
      : this.msAccounts.getAccessToken(accountId);
  }

  async setRootFolderId(provider: StorageProvider, accountId: string, folderId: string): Promise<void> {
    return provider === "google"
      ? this.googleAccounts.setRootFolderId(accountId, folderId)
      : this.msAccounts.setRootFolderId(accountId, folderId);
  }

  /**
   * Belirli bir hesabın Drive/OneDrive erişimi gerçekten kullanılabilir mi?
   *
   * `findAccountForUser` "en iyi adayı bul" için bu kontrolü zaten içeriden
   * yapıyor; bu metot ise sağlayıcısı ÖNCEDEN bilinen (ör. bir job_storage
   * satırından okunan) belirli bir hesabı doğrulamak için var.
   */
  isDriveReady(provider: StorageProvider, account: CloudAccount | undefined): boolean {
    return provider === "google"
      ? this.googleAccounts.isDriveReady(account as any)
      : this.msAccounts.isDriveReady(account as any);
  }

  // -------------------------------------------------------- klasör/dosya işlemleri

  /** Sağlayıcının kendi "kök" klasörünü döndürür (Google: "Projelio" klasörü, Microsoft: uygulama klasörü). */
  async ensureRootFolder(provider: StorageProvider, accessToken: string): Promise<CloudFile> {
    return provider === "google"
      ? this.googleDrive.findOrCreateFolder(accessToken, "Projelio")
      : this.oneDrive.getAppRootFolder(accessToken);
  }

  async findOrCreateFolder(
    provider: StorageProvider,
    accessToken: string,
    name: string,
    parentId?: string
  ): Promise<CloudFile> {
    return provider === "google"
      ? this.googleDrive.findOrCreateFolder(accessToken, name, parentId)
      : this.oneDrive.findOrCreateFolder(accessToken, name, parentId);
  }

  async uploadMultipart(
    provider: StorageProvider,
    accessToken: string,
    meta: { name: string; mimeType: string; parentId?: string },
    content: Buffer
  ): Promise<CloudFile> {
    return provider === "google"
      ? this.googleDrive.uploadMultipart(accessToken, meta, content)
      : this.oneDrive.uploadMultipart(accessToken, meta, content);
  }

  async createResumableSession(
    provider: StorageProvider,
    accessToken: string,
    meta: { name: string; mimeType: string; parentId?: string; sizeBytes?: number }
  ): Promise<string> {
    return provider === "google"
      ? this.googleDrive.createResumableSession(accessToken, meta)
      : this.oneDrive.createResumableSession(accessToken, meta);
  }

  async getFile(provider: StorageProvider, accessToken: string, fileId: string): Promise<CloudFile> {
    return provider === "google"
      ? this.googleDrive.getFile(accessToken, fileId)
      : this.oneDrive.getFile(accessToken, fileId);
  }

  async downloadResponse(
    provider: StorageProvider,
    accessToken: string,
    fileId: string,
    mimeType: string
  ): Promise<Response> {
    return provider === "google"
      ? this.googleDrive.downloadResponse(accessToken, fileId, mimeType)
      : this.oneDrive.downloadResponse(accessToken, fileId);
  }

  async renameFile(provider: StorageProvider, accessToken: string, fileId: string, name: string): Promise<CloudFile> {
    return provider === "google"
      ? this.googleDrive.renameFile(accessToken, fileId, name)
      : this.oneDrive.renameFile(accessToken, fileId, name);
  }

  async trashFile(provider: StorageProvider, accessToken: string, fileId: string): Promise<void> {
    return provider === "google"
      ? this.googleDrive.trashFile(accessToken, fileId)
      : this.oneDrive.trashFile(accessToken, fileId);
  }

  async getQuota(provider: StorageProvider, accessToken: string) {
    return provider === "google" ? this.googleDrive.getQuota(accessToken) : this.oneDrive.getQuota(accessToken);
  }

  // ---------------------------------------------------------------- paylaşım

  async grantPermission(
    provider: StorageProvider,
    accessToken: string,
    fileId: string,
    email: string,
    role: "reader" | "writer"
  ): Promise<{ permissionId: string }> {
    return provider === "google"
      ? this.googleDrive.grantPermission(accessToken, fileId, email, role)
      : this.oneDrive.grantPermission(accessToken, fileId, email, role);
  }

  async revokePermission(
    provider: StorageProvider,
    accessToken: string,
    fileId: string,
    permissionId: string
  ): Promise<void> {
    return provider === "google"
      ? this.googleDrive.revokePermission(accessToken, fileId, permissionId)
      : this.oneDrive.revokePermission(accessToken, fileId, permissionId);
  }
}
