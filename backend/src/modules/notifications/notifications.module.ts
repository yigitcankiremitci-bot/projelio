import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { DeadlineReminderProcessor } from "./deadline-reminder.processor";
import { DigestProcessor } from "./digest.processor";

@Module({
  // JwtModule burada da (auth.module.ts'teki aynı secret ile) kayıtlı: gateway,
  // soket bağlantısını "register" event'inde gelen token'ı doğrulamak için kullanır
  // (bkz. notifications.gateway.ts — client artık ham bir userId değil, JWT gönderir).
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "change-me",
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsGateway, NotificationsService, DeadlineReminderProcessor, DigestProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
