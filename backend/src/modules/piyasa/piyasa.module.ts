import { Module } from "@nestjs/common";
import { PiyasaController } from "./piyasa.controller";
import { PiyasaService } from "./piyasa.service";

/** Anasayfa panosunun dış verisi: TCMB kurları, haber akışları, borsa göstergeleri. */
@Module({
  controllers: [PiyasaController],
  providers: [PiyasaService],
})
export class PiyasaModule {}
