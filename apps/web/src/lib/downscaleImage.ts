/**
 * Görselin uzun kenarı için üst sınır.
 *
 * Anthropic zaten bu ölçünün üstündeki görselleri kendi tarafında küçültüyor,
 * yani daha büyüğünü göndermek hiçbir şey kazandırmıyor: yalnızca yükleme
 * süresi ve bellek harcanıyor. El yazısı okumak için de bu çözünürlük yeterli.
 */
const MAX_EDGE = 1568;

/** Sunucudaki görsel sınırı (bkz. AiAttachmentsService MAX_IMAGE_BYTES). */
const SERVER_IMAGE_LIMIT = 5 * 1024 * 1024;

/**
 * Fotoğrafı yüklemeden önce makul bir boyuta indirir.
 *
 * NEDEN GEREKLİ: telefon kameraları 3-8 MB'lık görseller üretiyor; sunucudaki
 * sınır 5 MB. Küçültme olmadan "kâğıda yazdığım listeyi çek" akışı ilk denemede
 * "bu görsel çok büyük" hatasına çarpıyordu.
 *
 * Dönüştürülemeyen bir dosya geldiğinde (ör. tarayıcının çözemediği bir biçim)
 * ORİJİNAL dosya geri verilir: sessizce bozuk bir görsel göndermektense sunucunun
 * anlaşılır hatasını almak daha iyi.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // GIF'te küçültme animasyonu düşürür; zaten fotoğraf değil.
  if (file.type === "image/gif") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  // Hem küçük hem sınırın altındaysa dokunma: yeniden kodlamak kaliteyi
  // gereksiz yere düşürür.
  if (scale === 1 && file.size <= SERVER_IMAGE_LIMIT) {
    bitmap.close?.();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    // 0.85: el yazısının okunabilirliğini koruyan en düşük makul kalite.
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) return file;

  const name = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
  return new File([blob], name, { type: "image/jpeg" });
}
