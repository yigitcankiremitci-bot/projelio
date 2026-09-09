/**
 * Sağlayıcının önizleme (küçük resim) üretebildiği türler.
 *
 * NEDEN TÜRE BAKIYORUZ: `thumbnail_link` yükleme ANINDA neredeyse hiçbir zaman
 * dolmuyor. Google önizlemeyi ASENKRON üretiyor (yükleme yanıtında alan yok),
 * OneDrive ise adresi yalnızca `$expand=thumbnails` ile veriyor ve içerik PUT'u
 * onu desteklemiyor. Kolon bir önbellek olduğu için de kimse sonradan
 * doldurmuyordu: canlıda 158 dosyanın 88'i görsel olmasına rağmen HİÇBİRİNDE
 * önizleme yoktu.
 *
 * Çözüm, kararı türe dayandırmak: önizlenebilir bir tür ise arayüz adresi
 * istiyor, sunucu da o an sağlayıcıdan çekip kolona yazıyor
 * (bkz. openThumbnail). Gerçekten önizleme çıkmazsa arayüz tür ikonuna düşer
 * (bkz. FilesPanel'deki onError).
 */
export function previewableMime(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  if (mimeType.startsWith("image/")) return true;
  if (mimeType.startsWith("video/")) return true;
  if (mimeType === "application/pdf") return true;
  // Google Dokümanlar/Tablolar/Sunular ve Office belgeleri: ikisinin de ilk
  // sayfasından önizleme üretiliyor.
  if (mimeType.startsWith("application/vnd.google-apps.")) return mimeType !== "application/vnd.google-apps.folder";
  if (mimeType.startsWith("application/vnd.openxmlformats-officedocument.")) return true;
  return false;
}

