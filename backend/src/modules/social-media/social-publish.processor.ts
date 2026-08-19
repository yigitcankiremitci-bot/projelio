import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InstagramPublishService } from "./instagram-publish.service";
import { InstagramService } from "./instagram.service";
import { SocialPublishService } from "./social-publish.service";

/**
 * Zamanlanmış yayının saati.
 *
 * Üç ayrı iş, üç ayrı ritim:
 *
 *   her 5 dakikada  kuyruk turu — vakti gelmiş içerikleri yayımlar
 *   her gün 04:00   jeton yenileme — süresi yaklaşan bağlantılar uzatılır
 *   her gün 04:30   geçici medya süpürme — yarım kalan denemelerin artıkları
 *
 * NEDEN 5 DAKİKA: sosyal medyada "19:00 gönderisi" 19:03'te çıkabilir, kimse
 * fark etmez; ama dakikada bir çalışan bir iş, tek kullanıcılı bir kurulumda
 * bile günde 1440 sorgu demek. 5 dakika, gecikmenin görünmez kaldığı en ucuz
 * aralık.
 *
 * ÇOK ÖRNEKLİ KURULUM UYARISI: backend birden fazla örnekte (instance)
 * koşuyorsa bu cron her örnekte ayrı çalışır ve aynı hedefi iki kez yayımlamayı
 * deneyebilir. Bugünkü kurulum tek örnek (bkz. render.yaml); ölçek büyüdüğünde
 * kuyruk BullMQ'ya taşınmalı — bağımlılık zaten projede var.
 */
@Injectable()
export class SocialPublishProcessor {
  private readonly logger = new Logger(SocialPublishProcessor.name);
  /** Bir tur bitmeden yenisi başlamasın: yavaş bir video yayını turları üst üste bindiriyordu. */
  private running = false;

  constructor(
    private publish: SocialPublishService,
    private instagram: InstagramService,
    private instagramPublish: InstagramPublishService
  ) {}

  @Cron("*/5 * * * *")
  async processQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.publish.runQueue();
      if (result.published || result.failed || result.skipped) {
        this.logger.log(
          `Yayın kuyruğu: ${result.published} yayımlandı, ${result.failed} başarısız, ${result.skipped} atlandı`
        );
      }
    } catch (err) {
      this.logger.error(`Yayın kuyruğu turu düştü: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Jeton yenileme.
   *
   * Instagram'da süresi DOLMUŞ jeton yenilenemez; kullanıcı yeniden bağlanmak
   * zorunda kalır. Bu yüzden yenileme, sürenin bitmesine günler kala çalışır
   * (bkz. SocialTokensService.findExpiring).
   */
  @Cron("0 4 * * *")
  async refreshTokens(): Promise<void> {
    try {
      const { refreshed, failed } = await this.instagram.refreshExpiringTokens();
      if (refreshed || failed) this.logger.log(`Instagram jetonları: ${refreshed} yenilendi, ${failed} düştü`);
    } catch (err) {
      this.logger.error(`Jeton yenileme turu düştü: ${(err as Error).message}`);
    }
  }

  /** Yarıda kalan yayın denemelerinin public kovada bıraktığı kopyalar. */
  @Cron("30 4 * * *")
  async sweepStagedMedia(): Promise<void> {
    try {
      const removed = await this.instagramPublish.sweepStagedMedia();
      if (removed > 0) this.logger.log(`Geçici yayın medyası temizlendi: ${removed} dosya`);
    } catch (err) {
      this.logger.error(`Medya süpürme düştü: ${(err as Error).message}`);
    }
  }
}
