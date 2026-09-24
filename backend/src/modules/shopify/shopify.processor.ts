import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ShopifyService } from "./shopify.service";

/**
 * Shopify webhook kuyruğunun işleyicisi.
 *
 *   webhook geldiğinde   hemen bir tur (ShopifyWebhookController tetikler)
 *   her dakika           yedek tur — tetik kaçtıysa ya da olay yeniden denenecekse
 *   her gün 04:40        30 günü geçmiş işlenmiş olayların silinmesi (kişisel veri)
 *   her gün 04:50        süresi yaklaşan yenileme jetonlarının yenilenmesi (bkz. 132)
 *
 * `running` bayrağı: webhook tetiği ile dakikalık tur çakışırsa aynı olay iki
 * kez işlenmesin. Sipariş yazımı tekil indeksle zaten korunuyor ama tahsilat
 * farkı hesabı sıralı işlemeye güveniyor.
 *
 * ÇOK ÖRNEKLİ KURULUM: bayrak süreç içi; backend birden çok örnekte koşarsa
 * (bugün tek örnek) kuyruk satır kilidiyle ya da BullMQ ile alınmalı.
 */
@Injectable()
export class ShopifyProcessor {
  private readonly logger = new Logger(ShopifyProcessor.name);
  private running = false;

  constructor(private shopify: ShopifyService) {}

  @Cron("* * * * *")
  async tur(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Bir tur en fazla 50 olay alır; birikme varsa boşalana kadar devam.
      for (let i = 0; i < 20; i++) {
        const r = await this.shopify.kuyruguIsle();
        if (r.islendi || r.hata || r.atlandi) {
          this.logger.log(`Shopify kuyruğu: ${r.islendi} işlendi, ${r.atlandi} atlandı, ${r.hata} hata`);
        }
        if (r.islendi + r.atlandi + r.hata < 50 || r.hata > 0) break;
      }
    } catch (err) {
      this.logger.error(`Shopify kuyruk turu düştü: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  @Cron("40 4 * * *")
  async supur(): Promise<void> {
    try {
      const n = await this.shopify.eskiOlaylariSil();
      if (n > 0) this.logger.log(`Eski Shopify olayları silindi: ${n}`);
    } catch (err) {
      this.logger.error(`Shopify olay süpürme düştü: ${(err as Error).message}`);
    }
  }

  /** Yenileme jetonu 90 gün kullanılmazsa ölür; bu iş onu canlı tutar. */
  @Cron("50 4 * * *")
  async jetonlariYenile(): Promise<void> {
    try {
      const { yenilendi, dustu } = await this.shopify.suresiYaklasanJetonlariYenile();
      if (yenilendi || dustu) this.logger.log(`Shopify jetonları: ${yenilendi} yenilendi, ${dustu} düştü`);
    } catch (err) {
      this.logger.error(`Shopify jeton yenileme turu düştü: ${(err as Error).message}`);
    }
  }
}
