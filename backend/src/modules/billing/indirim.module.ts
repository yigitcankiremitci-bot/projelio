import { Module } from "@nestjs/common";
import { IndirimService } from "./indirim.service";

/**
 * Yalnızca IndirimService'i paylaşan yaprak modül: abonelik (BillingModule) ve
 * Lio Bakiyesi siparişi (AiAssistantModule) ikisi de kullanıyor. BillingModule
 * AiAssistantModule'ü içe aktardığı için servis iki modülden birinde dursaydı
 * döngü olurdu (PayTRModule'deki gerekçenin aynısı).
 */
@Module({
  providers: [IndirimService],
  exports: [IndirimService],
})
export class IndirimModule {}
