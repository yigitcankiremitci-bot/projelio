import { Module } from "@nestjs/common";
import { BultenAdminController, BultenPublicController } from "./bulten.controller";
import { BultenService } from "./bulten.service";

/** Tanıtım sitesinin bülten aboneleri (bkz. migration 149). */
@Module({
  controllers: [BultenPublicController, BultenAdminController],
  providers: [BultenService],
})
export class BultenModule {}
