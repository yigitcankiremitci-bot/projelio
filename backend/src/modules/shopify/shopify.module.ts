import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PartyModule } from "../party/party.module";
import { ShopifyController } from "./shopify.controller";
import { ShopifyProcessor } from "./shopify.processor";
import { ShopifyService } from "./shopify.service";
import { ShopifyWebhookController } from "./shopify-webhook.controller";
import { getJwtSecret, getJwtExpiresIn } from "../../common/config/env";

@Module({
  imports: [
    // Sipariş ve tahsilat elle girişle AYNI kapıdan yazılır; kasa bağı
    // (deftereIsle) tek yerde kalsın.
    PartyModule,
    // OAuth `state` imzası — Instagram/Google akışıyla aynı desen.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [ShopifyController, ShopifyWebhookController],
  providers: [ShopifyService, ShopifyProcessor],
})
export class ShopifyModule {}
