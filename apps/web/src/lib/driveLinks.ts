import type { ProjectFile } from "@projelio/shared";

/**
 * Drive/OneDrive dosyaları için önizleme ve düzenleme adresleri.
 *
 * ÖNEMLİ: Google, Dokümanlar/E-Tablolar/Sunular editörünü `X-Frame-Options:
 * SAMEORIGIN` ile korur — editör başka bir siteye iframe olarak GÖMÜLEMEZ.
 * Gömülebilen tek şey `/preview` adresidir ve o da salt okunurdur.
 *
 * Bu yüzden akış şöyle: Projelio içinde `/preview` ile göster, "Düzenle"
 * denince Drive editörünü yeni sekmede aç. Kullanıcı sekmeyi kapatıp döndüğünde
 * önizleme yenilenir.
 *
 * OneDrive tarafında Google Dokümanlar'a karşılık gelen "sanal, ikili
 * içeriği olmayan" bir format yok (bkz. backend/onedrive.service.ts) ve
 * Graph API'nin Google'ın `/preview`'ına karşılık gelen genel, kimlik
 * doğrulaması istemeyen bir gömme adresi yok. Bu yüzden OneDrive dosyaları
 * için hem önizleme hem düzenleme, öğenin kendi `webViewLink`'ine (OneDrive'ın
 * web görünümü/Office Online editörü) yönlendirir.
 */

const GOOGLE_EDITOR_PATHS: Record<string, string> = {
  "application/vnd.google-apps.document": "document",
  "application/vnd.google-apps.spreadsheet": "spreadsheets",
  "application/vnd.google-apps.presentation": "presentation",
  "application/vnd.google-apps.drawing": "drawings",
};

/** Projelio içinde iframe'e gömülebilen, salt okunur önizleme adresi. */
export function drivePreviewUrl(file: ProjectFile): string {
  if (file.storageProvider === "microsoft") {
    return file.webViewLink ?? `https://onedrive.live.com`;
  }
  const editorPath = GOOGLE_EDITOR_PATHS[file.mimeType];
  if (editorPath) {
    return `https://docs.google.com/${editorPath}/d/${file.driveFileId}/preview`;
  }
  // Google formatı olmayan her şey (PDF, resim, Office dosyaları, video)
  return `https://drive.google.com/file/d/${file.driveFileId}/preview`;
}

/** Yeni sekmede açılacak düzenleme adresi. */
export function driveEditUrl(file: ProjectFile): string {
  if (file.storageProvider === "microsoft") {
    return file.webViewLink ?? `https://onedrive.live.com`;
  }
  const editorPath = GOOGLE_EDITOR_PATHS[file.mimeType];
  if (editorPath) {
    return `https://docs.google.com/${editorPath}/d/${file.driveFileId}/edit`;
  }
  // Office dosyaları Drive'da "Google Dokümanlar ile aç" seçeneğiyle düzenlenir;
  // webViewLink kullanıcıyı doğru ekrana götürür.
  return file.webViewLink ?? `https://drive.google.com/file/d/${file.driveFileId}/view`;
}

/** Bulut sağlayıcısının paylaşım ekranı — kullanıcı dışarıdan birini eklemek isterse. */
export function driveShareUrl(file: ProjectFile): string {
  if (file.storageProvider === "microsoft") {
    return file.webViewLink ?? `https://onedrive.live.com`;
  }
  return `https://drive.google.com/file/d/${file.driveFileId}/view?usp=sharing`;
}

/** Kartlarda/düğmelerde "Drive'da" ya da "OneDrive'da" gibi sağlayıcıya özel metin için. */
export function driveProviderLabel(file: ProjectFile): string {
  return file.storageProvider === "microsoft" ? "OneDrive" : "Drive";
}

/**
 * Dosya kendi sunucumuzdan (proxy) gösterilebilir mi?
 *
 * Resim ve PDF'leri Drive'a hiç uğramadan gösterebiliriz; bu, Google hesabı
 * olmayan ya da klasöre izni bulunmayan üyeler için de çalışan tek yoldur.
 */
export function canRenderLocally(file: ProjectFile): boolean {
  if (file.isGoogleDoc) return false;
  return file.mimeType.startsWith("image/") || file.mimeType === "application/pdf";
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "—";
  if (bytes === 0) return "0 B";
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${UNITS[exponent]}`;
}

/** Dosya türüne göre kısa, okunur etiket. */
export function fileKindLabel(file: ProjectFile): string {
  if (file.mimeType === "application/vnd.google-apps.document") return "Google Dokümanı";
  if (file.mimeType === "application/vnd.google-apps.spreadsheet") return "Google E-Tablo";
  if (file.mimeType === "application/vnd.google-apps.presentation") return "Google Sunu";
  if (file.mimeType.startsWith("image/")) return "Görsel";
  if (file.mimeType === "application/pdf") return "PDF";
  if (file.mimeType.startsWith("video/")) return "Video";
  if (file.mimeType.startsWith("audio/")) return "Ses";
  if (file.mimeType.includes("spreadsheet") || file.mimeType.includes("excel")) return "E-Tablo";
  if (file.mimeType.includes("word") || file.mimeType.includes("document")) return "Belge";
  if (file.mimeType.includes("presentation")) return "Sunum";
  return "Dosya";
}
