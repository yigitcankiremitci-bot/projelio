import { Module } from "@nestjs/common";
import { OfisDuzeniController } from "./ofis-duzeni.controller";
import { OfisDuzeniService } from "./ofis-duzeni.service";

@Module({
  controllers: [OfisDuzeniController],
  providers: [OfisDuzeniService],
})
export class OfisDuzeniModule {}
