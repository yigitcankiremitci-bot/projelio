import { Module } from "@nestjs/common";
import { ArkadaslarController } from "./arkadaslar.controller";
import { ArkadaslarService } from "./arkadaslar.service";
import { NotificationsModule } from "../notifications/notifications.module";

/**
 * Arkadaşlık (migration 134). Duvar paylaşımları burada DEĞİL, akışın geri
 * kalanıyla birlikte project-posts'ta: beğeni/yorum/etiket altyapısı ortak.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [ArkadaslarController],
  providers: [ArkadaslarService],
  exports: [ArkadaslarService],
})
export class ArkadaslarModule {}
