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
