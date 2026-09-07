import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BillingService } from "./billing.service";

/**
 * Gecelik abonelik bakımı.
 *
 * İKİ İŞ YAPAR:
 *   1. Süresi dolmuş (iptal edilmiş ya da ödemesi gecikmiş) abonelikleri kapatır.
 *   2. YILLIK abonelerin o ayki kredisini yükler — yıllık abone parayı yılda bir
 *      öder ama krediyi her ay alır, dolayısıyla kredi yüklemesi yenileme
 *      webhook'una bağlanamaz.
 *
 * SAAT SEÇİMİ: diğer gecelik işlerin (bütçe 08:00, harcama uyarısı 09:05)
 * üzerine binmesin diye 03:20. Kredi yüklemesi kullanıcı uyanmadan bitsin.
 *
 * HATA YUTULUR: tek bir aboneliğin sorunu tüm işi durdurmasın; ayrıntı log'a
 * düşer (BillingService.donemleriIlerlet içinde abonelik bazında yakalanıyor).
 */
@Injectable()
export class BillingRenewalProcessor {
  private readonly logger = new Logger(BillingRenewalProcessor.name);
  private readonly billing: BillingService;

  constructor(@Inject(BillingService) billing: BillingService) {
    this.billing = billing;
  }

  @Cron("20 3 * * *")
  async gunlukBakim(): Promise<void> {
    try {
      const sonuc = await this.billing.donemleriIlerlet();
      if (sonuc.krediYuklenen || sonuc.suresiDolan) {
        this.logger.log(
          `Abonelik bakımı: ${sonuc.krediYuklenen} aylık kredi yüklendi, ${sonuc.suresiDolan} abonelik süresi doldu.`
        );
      }
    } catch (error) {
      this.logger.error(`Abonelik bakımı başarısız: ${(error as Error).message}`);
    }
  }
}
