import { forwardRef, Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { WahaHttpClient } from "./waha.client";
import { WhatsappSendProcessor } from "./whatsapp-send.processor";
import { WhatsappWebhookController } from "./whatsapp-webhook.controller";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappService } from "./whatsapp.service";

/**
 * WhatsApp köprüsü (bkz. docs/whatsapp-qr-plan.md, 080_whatsapp.sql).
 *
 * Notifications ile iki yönlü bağımlılık: onlar bildirimi bize verir
 * (notifyUser), biz bağlantı durumunu onların gateway'iyle tarayıcıya basarız.
 * AccessService ve SupabaseService global modüllerden geliyor.
 */
@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WahaHttpClient, WhatsappService, WhatsappWebhookService, WhatsappSendProcessor],
  exports: [WhatsappService],
})
export class WhatsappModule {}
