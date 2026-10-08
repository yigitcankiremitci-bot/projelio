import { Module } from "@nestjs/common";
import { KartvizitController } from "./kartvizit.controller";
import { KartvizitService } from "./kartvizit.service";
import { PublicKartvizitController } from "./public-kartvizit.controller";

/** Dijital kartvizit (bkz. migration 151, packages/shared kartvizit.ts). */
@Module({
  controllers: [KartvizitController, PublicKartvizitController],
  providers: [KartvizitService],
})
export class KartvizitModule {}
