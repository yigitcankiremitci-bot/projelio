import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { RealtimeGateway } from "./realtime.gateway";
import { getJwtSecret } from "../../common/config/env";

/**
 * Canlı işbirliği: aynı sayfadaki kullanıcıların birbirini görmesi ve
 * değişikliklerin anında yansıması (bkz. realtime.gateway.ts).
 *
 * JwtModule burada da kayıtlı (auth.module.ts ile aynı secret): odaya katılma
 * isteği soket üzerinden geliyor, HTTP guard'ları devrede değil — kimlik
 * doğrudan token'dan çözülür.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
