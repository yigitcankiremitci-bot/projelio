import { forwardRef, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { DeadlineReminderProcessor } from "./deadline-reminder.processor";
import { DigestProcessor } from "./digest.processor";
import { NotificationEmailPrefsService } from "./notification-email-prefs.service";
import { NotificationEmailProcessor } from "./notification-email.processor";
import { getJwtSecret } from "../../common/config/env";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { EmailModule } from "../auth/email.module";

@Module({
  // JwtModule burada da (auth.module.ts'teki aynı secret ile) kayıtlı: gateway,
  // soket bağlantısını "register" event'inde gelen token'ı doğrulamak için kullanır
  // (bkz. notifications.gateway.ts — client artık ham bir userId değil, JWT gönderir).
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
    }),
    // İki yönlü bağımlılık (bkz. notifications.service.ts constructor).
    forwardRef(() => WhatsappModule),
    // Bildirimlerin dördüncü kanalı: e-posta (bkz. migration 102). EmailModule
    // bilerek bağımlılıksız, bu yüzden döngü riski yok.
    EmailModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationsService,
    DeadlineReminderProcessor,
    DigestProcessor,
    NotificationEmailPrefsService,
    NotificationEmailProcessor,
  ],
  // Gateway de dışarı açık: WhatsApp modülü bağlantı durumunu aynı odaya basıyor.
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
