import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DemoRandevuService } from "./demo-randevu.service";

/**
 * Demo hatırlatma e-postaları: 1 gün ve 1 saat önce (bkz.
 * DemoRandevuService.hatirlatmaTuru). 5 dakikada bir — en kötü ihtimalle
 * "1 saat kala" e-postası 55 dakika kala gider.
 */
@Injectable()
export class DemoRandevuProcessor {
  private readonly logger = new Logger(DemoRandevuProcessor.name);
  /** Turlar üst üste binmesin (bkz. deadline-reminder.processor.ts). */
  private running = false;

  constructor(private demo: DemoRandevuService) {}

  @Cron("*/5 * * * *")
  async tur() {
    if (this.running) return;
    this.running = true;
    try {
      await this.demo.hatirlatmaTuru();
    } catch (e) {
      this.logger.error(`Demo hatırlatma turu düştü: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }
}
