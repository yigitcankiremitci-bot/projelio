import { Module } from "@nestjs/common";
import { AiAssistantModule } from "../ai-assistant/ai-assistant.module";
import { AppleStoreClient } from "./apple-store.client";
import { BillingAdminController } from "./billing-admin.controller";
import { BillingPublicController } from "./billing-public.controller";
import { BillingRenewalProcessor } from "./billing-renewal.processor";
import { BillingSettingsService } from "./billing-settings.service";
import { BillingWebhookController } from "./billing-webhook.controller";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { GooglePlayClient } from "./google-play.client";
import { IyzicoClient } from "./iyzico.client";
import { PayTROdemeService } from "./paytr-odeme.service";
import { PayTRModule } from "./paytr.module";
import { StorePurchasesService } from "./store-purchases.service";
import { TcmbKuruService } from "./tcmb-kuru.service";

/**
 * Abonelik (paket) modülü — iyzico + App Store + Google Play.
 *
 * AiAssistantModule'den yalnızca AiCreditsService alınıyor: dönemlik krediyi
 * yükleyen tek yol o servis, kredi defteri mantığı burada KOPYALANMIYOR.
 * Ters yön (AI tarafının aboneliği sorması) bilinçli olarak yok — Lio'nun
 * çalışması bakiyeye bakar, paketin ne olduğuna değil.
 *
 * SupabaseService global modülden geliyor.
 */
@Module({
  imports: [AiAssistantModule, PayTRModule],
  controllers: [BillingController, BillingPublicController, BillingWebhookController, BillingAdminController],
  providers: [
    BillingService,
    BillingSettingsService,
    IyzicoClient,
    PayTROdemeService,
    AppleStoreClient,
    GooglePlayClient,
    StorePurchasesService,
    BillingRenewalProcessor,
    TcmbKuruService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
