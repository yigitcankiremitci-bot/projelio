import { Module } from "@nestjs/common";
import { MuzeController } from "./muze.controller";
import { MuzeService } from "./muze.service";

/** Müze: biten projelerin değiştirilemez plaketleri (migration 189). */
@Module({
  controllers: [MuzeController],
  providers: [MuzeService],
})
export class MuzeModule {}
