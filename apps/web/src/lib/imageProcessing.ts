// Kapak fotoğraflarını sunucuya göndermeden önce sabit boyuta kırpıp
// sıkıştırır, böylece depolamada gereksiz yer kaplamazlar.

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 400;
const JPEG_QUALITY = 0.8;

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel yüklenemedi"));
    };
    img.src = url;
  });
}

// Profil fotoğrafı: kartta 116px gösteriliyor, 200px retina için yeterli.
// Düşük kalite (%60) ile dosya ~10 KB civarında kalıyor.
export const AVATAR_SIZE = 200;
const AVATAR_QUALITY = 0.6;

// Kullanıcının kırpma arayüzünde seçtiği alan: kaynak görselin piksel koordinatlarında
// kare bir bölge. AvatarCropper bu değerleri hesaplayıp buraya geçirir.
export interface CropArea {
  x: number;
  y: number;
  size: number;
}

// Kırpılmış kareyi 200px'e ölçekleyip JPEG olarak sıkıştırır.
export async function cropAvatarImage(file: File, crop: CropArea): Promise<File> {
  try {
    const img = await loadImageElement(file);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // JPEG şeffaflık desteklemez; şeffaf PNG'lerin boş alanları siyah çıkmasın diye
    // önce beyaz zemin çiziliyor.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", AVATAR_QUALITY));
    if (!blob) return file;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch (err) {
    console.error("Profil fotoğrafı işlenemedi, orijinal dosya yükleniyor:", err);
    return file;
  }
}

export async function resizeCoverImage(file: File): Promise<File> {
  try {
    // createImageBitmap yerine klasik <img> yükleme kullanılıyor; bazı tarayıcılarda
    // createImageBitmap sessizce başarısız olup işlenmemiş orijinal dosyanın (şeffaf
    // PNG dahil) olduğu gibi yüklenmesine yol açıyordu.
    const img = await loadImageElement(file);
    const canvas = document.createElement("canvas");
    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // JPEG şeffaflığı desteklemez; PNG'lerin şeffaf alanları doldurulmazsa
    // siyah çıkar. Önce beyaz zemin çizip üstüne fotoğrafı yerleştiriyoruz.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

    // "cover" mantığıyla ortadan kırp: hedef alanı tamamen kaplayacak şekilde
    // ölçekle, taşan kısımları kes.
    const scale = Math.max(TARGET_WIDTH / img.naturalWidth, TARGET_HEIGHT / img.naturalHeight);
    const drawWidth = img.naturalWidth * scale;
    const drawHeight = img.naturalHeight * scale;
    const dx = (TARGET_WIDTH - drawWidth) / 2;
    const dy = (TARGET_HEIGHT - drawHeight) / 2;
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;
    return new File([blob], "cover.jpg", { type: "image/jpeg" });
  } catch (err) {
    console.error("Kapak fotoğrafı işlenemedi, orijinal dosya yükleniyor:", err);
    return file;
  }
}
