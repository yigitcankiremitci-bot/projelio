import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SupabaseService } from "../../database/supabase.service";

/**
 * Yarım kalan parçalı yükleme oturumlarını temizler.
 *
 * NEDEN GEREKTİ: 8 MB üstü dosyalar tarayıcıdan doğrudan Drive/OneDrive'a
 * yükleniyor; bizim tarafta önce bir `file_upload_sessions` satırı açılıyor ve
 * yükleme bitince "tamamlandı" diye işaretleniyor. Yükleme yarıda kalırsa
 * (sekme kapandı, bağlantı koptu, kullanıcı VAZGEÇTİ) o satır açık kalıyor.
 *
 * Temizleyen SQL fonksiyonu (`purge_stale_upload_sessions`, bkz. migration 022/023)
 * yazılmış ama HİÇBİR YERDEN ÇAĞRILMIYORDU — yani süresi dolmuş oturumlar
 * tabloda sonsuza kadar birikiyordu. Yüklemeyi iptal etme özelliği eklendikten
 * sonra bu daha sık olacağı için zamanlanmış çağrı buraya kondu.
 *
 * Fonksiyon yalnızca `completed_at is null` VE `expires_at` geçmiş satırları
 * siliyor; süren bir yüklemeye dokunma ihtimali yok.
 */
@Injectable()
export class FilesCleanupProcessor {
  private readonly logger = new Logger(FilesCleanupProcessor.name);

  constructor(private supabase: SupabaseService) {}

  // Her gün 04:15 — diğer gece işlerinin (04:00, 04:30) arasına denk gelmesin diye.
  @Cron("15 4 * * *")
  async purgeStaleUploadSessions(): Promise<void> {
    try {
      const { data, error } = await this.supabase.client.rpc("purge_stale_upload_sessions");
      if (error) throw error;

      const silinen = Number(data ?? 0);
      // Sıfırsa log'u kirletme; bir şey silindiyse görünür olsun.
      if (silinen > 0) this.logger.log(`Süresi dolmuş ${silinen} yükleme oturumu temizlendi.`);
    } catch (error) {
      // Temizlik arızası uygulamayı etkilemez, ama sessizce ölürse tablo yine
      // büyümeye devam eder ve kimse fark etmez.
      this.logger.error(`Yükleme oturumu temizliği başarısız: ${(error as Error).message}`);
    }
  }
}
