/**
 * MIME türünden kısa, okunur bir etiket ("PDF", "Görsel", "E-Tablo").
 *
 * SUNUCUDA ÜRETİLİYOR çünkü bu etiketi gören sayfa, Projelio hesabı olmayan
 * birinin açtığı indirme sayfası: oraya dosyanın MIME türünü göndermemek için
 * bir sebep yok ama etiketi ön yüzde ikinci kez yazmak, web'deki kopyayla
 * (lib/driveLinks.ts fileKindLabel) zamanla ayrışırdı.
 */
export function dosyaTuruEtiketi(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.document") return "Google Dokümanı";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "Google E-Tablo";
  if (mimeType === "application/vnd.google-apps.presentation") return "Google Sunu";
  if (mimeType.startsWith("image/")) return "Görsel";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Ses";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "E-Tablo";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "Sunu";
  if (mimeType.includes("word") || mimeType.includes("document")) return "Belge";
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("rar")) return "Arşiv";
  if (mimeType.startsWith("text/")) return "Metin";
  return "Dosya";
}

/** Bayt sayısını okunur boyuta çevirir. Bilinmiyorsa undefined (uydurma "0 B" değil). */
export function boyutMetni(bytes?: number | null): string | undefined {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return undefined;
  if (bytes === 0) return "0 B";
  const birimler = ["B", "KB", "MB", "GB", "TB"];
  const us = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), birimler.length - 1);
  const deger = bytes / 1024 ** us;
  return `${deger.toFixed(deger >= 10 || us === 0 ? 0 : 1)} ${birimler[us]}`;
}
