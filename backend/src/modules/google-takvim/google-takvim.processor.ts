import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { GoogleTakvimService } from "./google-takvim.service";

/**
 * Arka plan eşitlemesi: bağlı her kullanıcının yakın penceresi (7 gün geri,
 * 60 gün ileri) 15 dakikada bir tazelenir. Takvim sayfası kendi aralığını
 * ayrıca açılışta ister; bu tur, sayfayı hiç açmayanlar için Lio'nun ve
 * "bugün ne var" sorularının bayat veriyle cevaplanmamasını sağlıyor.
 *
 * Google'ın anlık bildirimleri (push channel) bilinçli olarak kullanılmıyor:
 * doğrulanmış bir webhook alan adı ve kanal yenileme işi ister; bu ölçekte
 * 15 dakikalık gecikme kabul edilebilir.
 */
@Injectable()
export class GoogleTakvimProcessor {
  private readonly logger = new Logger(GoogleTakvimProcessor.name);
  /** Turlar üst üste binmesin (bkz. deadline-reminder.processor.ts). */
  private running = false;

  constructor(private takvim: GoogleTakvimService) {}

  @Cron("*/15 * * * *")
  async tur() {
    if (this.running) return;
    this.running = true;
    try {
      await this.takvim.cronTuru();
    } catch (e) {
      this.logger.error(`Google Takvim eşitleme turu düştü: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }
}
