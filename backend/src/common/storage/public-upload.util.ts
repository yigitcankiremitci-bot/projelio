import { Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bir kapak/avatar klasöründe, az önce yazılan dosya DIŞINDAKİ her şeyi siler.
 *
 * SORUN. Kapak ve avatar yükleyen sekiz uç da dosyayı benzersiz bir yola yazıyor
 * (`${id}/${randomUUID()}.${ext}`) ve ardından yalnızca veritabanındaki URL'i
 * güncelliyordu. `upsert: true` yazıyor ama yol her seferinde farklı olduğu için
 * hiçbir zaman üzerine yazmıyor: eski nesne kovada sonsuza kadar kalıyordu.
 * Kapağını 100 kez değiştiren kullanıcı kovada 100 dosya bırakıyor, 99'una
 * hiçbir yerden erişilmiyor. Depolama maliyeti sınırsız büyüyordu.
 *
 * NEDEN "ESKİ URL'İ SİL" DEĞİL DE "KLASÖRÜ TEMİZLE". Eski URL'i silmek için her
 * serviste yükleme öncesi mevcut kaydı okumak gerekirdi (tablo adı ve findOne
 * imzası serviste serviste değişiyor). Klasör yolu ise zaten elimizde ve her
 * varlığın kendi klasörü var. Ek fayda: bu yöntem GEÇMİŞTE birikmiş artıkları
 * da topluyor, yalnızca bundan sonrasını değil.
 *
 * NEDEN HATA YUTULUYOR. Temizlik, yüklemenin başarısı için şart değil — asıl iş
 * (yeni görselin yazılması ve kaydın güncellenmesi) çoktan bitti. Temizlik
 * başarısız diye kullanıcıya hata döndürmek, çalışan bir işlemi başarısız
 * göstermek olurdu; sadece log'a yazıp geçiyoruz.
 */

const logger = new Logger("PublicUpload");

/** `a/b/c.png` -> `{ folder: "a/b", fileName: "c.png" }` */
export function splitObjectPath(path: string): { folder: string; fileName: string } {
  const index = path.lastIndexOf("/");
  if (index === -1) return { folder: "", fileName: path };
  return { folder: path.slice(0, index), fileName: path.slice(index + 1) };
}

/**
 * @param keepPath Az önce yüklenen dosyanın tam yolu. Klasörü bu yoldan
 *                 türetilir ve bu dosya korunur; klasördeki diğerleri silinir.
 */
export async function removeStaleUploadsInFolder(
  client: SupabaseClient,
  bucket: string,
  keepPath: string
): Promise<void> {
  const { folder, fileName } = splitObjectPath(keepPath);
  if (!folder) return; // Klasörsüz yol beklenmiyor; kovanın kökünü temizlemeyelim.

  try {
    const { data, error } = await client.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) {
      logger.warn(`Eski görseller listelenemedi (${bucket}/${folder}): ${error.message}`);
      return;
    }

    const stale = (data ?? [])
      .map((entry) => entry.name)
      .filter((name) => name && name !== fileName)
      .map((name) => `${folder}/${name}`);
    if (stale.length === 0) return;

    const { error: removeError } = await client.storage.from(bucket).remove(stale);
    if (removeError) {
      logger.warn(`Eski görseller silinemedi (${bucket}/${folder}): ${removeError.message}`);
    }
  } catch (error) {
    logger.warn(`Eski görseller temizlenemedi (${bucket}/${folder}): ${(error as Error).message}`);
  }
}
