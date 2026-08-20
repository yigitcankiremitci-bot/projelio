import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { HabieController } from "./habie.controller";
import { HabieService } from "./habie.service";
import { getJwtSecret, getJwtExpiresIn } from "../../common/config/env";

/**
 * Habie mesajlaşma modülünün Projelio tarafındaki köprüsü.
 *
 * Mevcut hiçbir modüle dokunmaz; yalnızca jeton üretir. Lio'nun kendisi
 * AiAssistantModule'de kalır ve değişmez — Habie ona /ai/chat üzerinden,
 * normal bir istemci gibi konuşur.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() },
    }),
  ],
  controllers: [HabieController],
  providers: [HabieService],
})
export class HabieModule {}
