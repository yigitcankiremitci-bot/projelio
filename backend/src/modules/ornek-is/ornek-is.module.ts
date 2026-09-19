import { Module } from "@nestjs/common";
import { OrnekIsController } from "./ornek-is.controller";
import { OrnekIsService } from "./ornek-is.service";

/**
 * Bağımlılıksız bilerek (yalnızca global SupabaseService): UsersModule
 * sihirbazın bitişinde bu servisi çağırıyor ve buradan iş/görev modüllerine
 * uzanan bir zincir, döngüsel bağımlılık riskini sihirbaza taşırdı.
 */
@Module({
  controllers: [OrnekIsController],
  providers: [OrnekIsService],
  exports: [OrnekIsService],
})
export class OrnekIsModule {}
