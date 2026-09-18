import { Module } from "@nestjs/common";
import { PayTRClient } from "./paytr.client";

/**
 * Yalnızca PayTRClient'ı paylaşan yaprak modül.
 *
 * NEDEN AYRI BİR MODÜL: hem BillingModule (ödeme akışı) hem AiAssistantModule
 * (bakiye ekranının "ödeme açık mı" bilgisi) bu istemciye ihtiyaç duyuyor.
 * BillingModule zaten AiAssistantModule'ü içe aktardığı için, AiAssistantModule'ün
 * BillingModule'ü içe aktarması DÖNGÜ olurdu ve uygulama açılışta patlardı
 * (tip denetimi ve testler bunu görmez, ancak açılışta çıkar).
 *
 * İstemci durumsuz: yapılandırmayı her çağrıda ortam değişkeninden okuyor, bu
 * yüzden iki modülde de aynı örneği paylaşmak bir zorunluluk değil ama tek
 * tanım noktası olması karışıklığı önlüyor.
 */
@Module({
  providers: [PayTRClient],
  exports: [PayTRClient],
})
export class PayTRModule {}
