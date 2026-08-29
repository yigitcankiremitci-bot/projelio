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

/**
 * Ürün fotoğrafı — kapak fotoğrafından oranıyla ayrılır.
 *
 * ORAN. Kapaklar 1200×400 (3:1) bir afiş şeridi; sayfanın tepesinde bir doku
 * olmaları yeterli. Ürün fotoğrafı ise ürünün KENDİSİ: 3:1'e sıkıştırılan bir
 * sandalye fotoğrafından geriye oturma yeri kalmıyordu. Burada 4:3 kullanılıyor,
 * kart da bu orana göre yükseltildi (bkz. ProductCard COVER_HEIGHT).
 *
 * BEYAZ DOLGU YOK. Önce "contain" denendi (fotoğrafın tamamı sığar, artan yer
 * beyaz) — ürünün hiçbir kenarı kesilmesin diye. Sonuç kabul edilmedi: kartlar
 * beyaz bantlı görünüyordu. Artık çerçeveyi dolduran en küçük ölçek taban
 * alınıyor ("cover"), yani beyaz bant hiç oluşmuyor; fotoğrafın hangi kısmının
 * görüneceğini kullanıcı seçiyor (bkz. ProductPhotoCropModal).
 *
 * Beyaz zemin yine de çiziliyor: şeffaf PNG'lerin boş alanları siyah çıkmasın
 * diye gerekli.
 */
export const PRODUCT_WIDTH = 1200;
export const PRODUCT_HEIGHT = 900;
/** Çerçevenin en/boy oranı — kırpma arayüzü ile çıktı aynı orandan türetilir. */
export const PRODUCT_ASPECT = PRODUCT_WIDTH / PRODUCT_HEIGHT;

/**
 * Kullanıcının seçtiği alan, KAYNAK görselin piksel koordinatlarında.
 *
 * Dikdörtgen her zaman görselin İÇİNDE kalır: kırpma arayüzü en küçük
 * yakınlaştırma olarak çerçeveyi dolduran ölçeği alıyor, o yüzden dışarı taşan
 * (dolayısıyla beyaz bant bırakan) bir seçim üretilemiyor.
 */
export interface ProductCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * @param crop Verilmezse fotoğrafın tamamı çerçeveye sığdırılır ("contain") —
 *             yani kırpma arayüzünden geçmeyen çağrılar eski davranışı korur.
 */
export async function resizeProductImage(file: File, crop?: ProductCropArea): Promise<File> {
  try {
    const img = await loadImageElement(file);
    const canvas = document.createElement("canvas");
    canvas.width = PRODUCT_WIDTH;
    canvas.height = PRODUCT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PRODUCT_WIDTH, PRODUCT_HEIGHT);

    if (crop) {
      // Kaynak dikdörtgeni görselin dışına taşabilir. drawImage bu durumda
      // kesişimi çizip hedefteki karşılığını boş bırakıyor (HTML canvas
      // kuralı) — yani beyaz zemin görünüyor. Ayrıca kırpma alanının oranı
      // çerçeveyle aynı olduğu için görüntü ezilmiyor.
      ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, PRODUCT_WIDTH, PRODUCT_HEIGHT);
    } else {
      // Kırpma arayüzünden geçmeyen çağrılar: ortadan "cover". Math.min olsaydı
      // (contain) fotoğraf sığar ama iki yanında beyaz bant kalırdı.
      const scale = Math.max(PRODUCT_WIDTH / img.naturalWidth, PRODUCT_HEIGHT / img.naturalHeight);
      const drawWidth = img.naturalWidth * scale;
      const drawHeight = img.naturalHeight * scale;
      ctx.drawImage(img, (PRODUCT_WIDTH - drawWidth) / 2, (PRODUCT_HEIGHT - drawHeight) / 2, drawWidth, drawHeight);
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;
    return new File([blob], "urun.jpg", { type: "image/jpeg" });
  } catch (err) {
    console.error("Ürün fotoğrafı işlenemedi, orijinal dosya yükleniyor:", err);
    return file;
  }
}
