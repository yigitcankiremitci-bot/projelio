/** Dosyanın gerçek içeriğinin hangi bulut sağlayıcısında olduğu. */
export type StorageProvider = "google" | "microsoft";

/** Google DriveFile ile OneDrive DriveFile'ın ortak alanları. */
export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink?: string;
  iconLink?: string;
  md5Checksum?: string;
  trashed?: boolean;
  /**
   * Dosyanın içinde bulunduğu klasör(ler).
   *
   * "Drive'dan ekle" akışı bunu okuyor: seçilen dosya ZATEN hedef klasördeyse
   * kopyalamak, aynı dosyadan ikinci bir kopya yaratıp kullanıcının Drive
   * kotasını yemek olur (bkz. FilesService.importForJob).
   */
  parentIds?: string[];
}

/** Google GoogleAccount ile Microsoft MicrosoftAccount'ın ortak alanları. */
export interface CloudAccount {
  id: string;
  userId: string;
  email: string;
  pictureUrl?: string;
  rootFolderId?: string;
  hasRefreshToken: boolean;
  driveRevokedAt?: string;
  connectedAt: string;
}

export interface ResolvedCloudAccount {
  provider: StorageProvider;
  account: CloudAccount;
}
