import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { WebSitesiService } from "./web-sitesi.service";

/**
 * Siteye giden ürün bildirimlerinin işleyicisi (kuyruk: web_sitesi_kuyrugu).
 *
 *   her dakika      kuyruk turu — ürünü değiştiren her yol (kart, içe aktarma,
 *                   Shopify, Lio) tetikleyiciyle kuyruğa yazar, burası gönderir
 *   stok hareketi   site satış bildirince beklemeden bir tur
 *
 * `running` bayrağı Shopify işleyicisiyle aynı sebepten: iki tur aynı satırı
 * iki kez göndermesin. ÇOK ÖRNEKLİ KURULUMDA (bugün tek örnek) satır kilidi gerekir.
 */
@Injectable()
export class WebSitesiProcessor {
  private readonly logger = new Logger(WebSitesiProcessor.name);
  private running = false;

  constructor(private service: WebSitesiService) {}

  tetikle(): void {
    void this.tur();
  }

  @Cron("* * * * *")
  async tur(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < 20; i++) {
        const r = await this.service.kuyruguIsle();
        const toplam = r.gonderildi + r.hata + r.birakildi;
        if (r.hata || r.birakildi) {
          this.logger.warn(`Web sitesi bildirimleri: ${r.gonderildi} gönderildi, ${r.hata} hata, ${r.birakildi} bırakıldı`);
        }
        // Bir tur 50 satır alır; dolu geldiyse ve her şey yolundaysa devam.
        if (toplam < 50 || r.hata > 0) break;
      }
    } catch (err) {
      this.logger.error(`Web sitesi bildirim turu düştü: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
