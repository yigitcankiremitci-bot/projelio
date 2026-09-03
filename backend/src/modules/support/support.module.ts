import { Module } from "@nestjs/common";
import { SupportAdminController, SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService],
  // Lio destek talebi açabiliyor (bkz. ai-assistant.tools.ts create_support_request).
  exports: [SupportService],
})
export class SupportModule {}
