import { Module } from "@nestjs/common";
import { GoogleCoreModule } from "../google/google-core.module";
import { GoogleTakvimController } from "./google-takvim.controller";
import { GoogleTakvimProcessor } from "./google-takvim.processor";
import { GoogleTakvimService } from "./google-takvim.service";

/**
 * Google Takvim entegrasyonu. Yalnızca GoogleCoreModule'e (OAuth + jeton
 * şifreleme) bağımlı; bu sayede üç yerden döngüsüz içeri alınabiliyor:
 * GoogleModule (ortak OAuth dönüşü bağlantıyı kaydediyor), PlanningModule
 * (blok taşınınca Google'daki kopyası taşınıyor) ve AiAssistantModule (Lio).
 */
@Module({
  imports: [GoogleCoreModule],
  controllers: [GoogleTakvimController],
  providers: [GoogleTakvimService, GoogleTakvimProcessor],
  exports: [GoogleTakvimService],
})
export class GoogleTakvimModule {}
