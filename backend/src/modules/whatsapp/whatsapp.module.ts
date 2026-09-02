import { forwardRef, Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { WahaHttpClient } from "./waha.client";
import { WhatsappAdminController } from "./whatsapp-admin.controller";
import { WhatsappLioService } from "./whatsapp-lio.service";
import { WhatsappSendProcessor } from "./whatsapp-send.processor";
import { WhatsappWebhookController } from "./whatsapp-webhook.controller";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappService } from "./whatsapp.service";

/**
 * WhatsApp köprüsü — havuz modeli (bkz. docs/whatsapp-qr-plan.md §12,
 * 080_whatsapp.sql + 081_whatsapp_havuz.sql).
 *
 * Notifications ile iki yönlü bağımlılık: onlar bildirimi bize verir
 * (notifyUser), biz gelen müşteri mesajını onlarla bildirir ve numara
 * durumunu gateway'leriyle tarayıcıya basarız. AccessService ve
 * SupabaseService global modüllerden geliyor.
 *
 * WhatsappLioService, Lio'nun WhatsApp araçlarını (ai-assistant.tools.ts)
 * gerçekleştirir; AI modülü bu servisi WhatsappModule'den alır. Ters yön
 * (otomatik yanıt için draftText) modül import'u DEĞİL: AiAssistantModule
 * → TasksModule → NotificationsModule → WhatsappModule zinciri zaten var,
 * buradan AiAssistantModule'ü de içe aktarmak dosya düzeyinde döngü yaratıp
 * AiAssistantModule'ün ilk import'unu tanımsız bırakıyordu ("module at index
 * [0] is undefined", 2026-09-03 dağıtımı bu yüzden geri alındı). Lio servisi
 * AiAssistantService'i ModuleRef ile çağrı anında çözer.
 */
@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [WhatsappController, WhatsappAdminController, WhatsappWebhookController],
  providers: [WahaHttpClient, WhatsappService, WhatsappLioService, WhatsappWebhookService, WhatsappSendProcessor],
  exports: [WhatsappService, WhatsappLioService],
})
export class WhatsappModule {}
