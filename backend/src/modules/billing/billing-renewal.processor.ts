import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BillingService } from "./billing.service";
import { PayTRAbonelikService } from "./paytr-abonelik.service";

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
  private readonly paytr: PayTRAbonelikService;

  constructor(
    @Inject(BillingService) billing: BillingService,
    @Inject(PayTRAbonelikService) paytr: PayTRAbonelikService
  ) {
    this.billing = billing;
    this.paytr = paytr;
  }

  /**
   * PayTR yenilemeleri SAAT BAŞI: iyzico'da yenilemeyi sağlayıcı yapıyordu,
   * PayTR'de biz yapıyoruz. Günde bir kez koşsaydı vadesi öğlen dolan abone
   * ertesi sabaha kadar yenilenmemiş görünür, yeniden denemeler de bir güne
   * kadar kayardı. Tekrar koşması güvenli (bkz. PayTRAbonelikService kural 3).
   */
  @Cron("7 * * * *")
  async paytrSaatlik(): Promise<void> {
    try {
      const sonuc = await this.paytr.saatlikIs();
      if (sonuc.denenen || sonuc.hatirlatma || sonuc.biten) {
        this.logger.log(
          `PayTR abonelik işi: ${sonuc.denenen} yenileme denendi, ${sonuc.hatirlatma} hatırlatma gönderildi, ${sonuc.biten} abonelik sona erdi.`
        );
      }
    } catch (error) {
      this.logger.error(`PayTR abonelik işi başarısız: ${(error as Error).message}`);
    }
  }

  @Cron("20 3 * * *")
  async gunlukBakim(): Promise<void> {
    try {
      const sonuc = await this.billing.donemleriIlerlet();
      if (sonuc.krediYuklenen || sonuc.suresiDolan || sonuc.birimiBiten) {
        this.logger.log(
          `Abonelik bakımı: ${sonuc.krediYuklenen} aylık kredi yüklendi, ${sonuc.suresiDolan} abonelik süresi doldu, ${sonuc.birimiBiten} kullanıcının paket birimi sona erdi.`
        );
      }
    } catch (error) {
      this.logger.error(`Abonelik bakımı başarısız: ${(error as Error).message}`);
    }
  }
}
