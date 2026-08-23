import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { AccountDeletionService, GRACE_PERIOD_DAYS } from "./account-deletion.service";

/**
 * Bekleme süresi dolmuş hesapları gerçekten siler.
 *
 * Hesap silme iki aşamalı (bkz. AccountDeletionService): kullanıcı "sil" dediğinde
 * yalnızca saat başlıyor, veri olduğu gibi duruyor ve giriş yapılınca talep
 * iptal oluyor. Asıl silmeyi burası yapıyor.
 *
 * NEDEN ZAMANLANMIŞ İŞ, "İLK GİRİŞTE KONTROL" DEĞİL: silinen kullanıcı bir daha
 * hiç giriş yapmayabilir — tanım gereği zaten gitmiş biri. Bir tetikleyiciye
 * bağlamak, verinin süresiz durması demekti; oysa kullanıcıya "30 gün sonra
 * silinecek" sözü verdik ve bu söz tutulmalı.
 */
@Injectable()
export class AccountPurgeProcessor {
  private readonly logger = new Logger(AccountPurgeProcessor.name);

  constructor(private accountDeletion: AccountDeletionService) {}

  // Her gün 03:30 — diğer gece işlerinden (04:00, 04:15, 04:30) önce, yükün
  // üst üste binmemesi için.
  @Cron("30 3 * * *")
  async purge(): Promise<void> {
    try {
      const silinen = await this.accountDeletion.purgeExpiredAccounts();
      // Sıfırsa log'u kirletme; bir hesap silindiyse iz kalsın — geri alınamayan
      // bir işlem, ne zaman olduğu görülebilmeli.
      if (silinen > 0) {
        this.logger.log(`${GRACE_PERIOD_DAYS} günlük bekleme süresi dolan ${silinen} hesap kalıcı olarak silindi.`);
      }
    } catch (error) {
      this.logger.error(`Hesap silme işi başarısız: ${(error as Error).message}`);
    }
  }
}
