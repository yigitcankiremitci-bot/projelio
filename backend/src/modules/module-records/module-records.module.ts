import { Module } from "@nestjs/common";
import { ModuleRecordsController } from "./module-records.controller";
import { ModuleRecordsService } from "./module-records.service";

@Module({
  controllers: [ModuleRecordsController],
  providers: [ModuleRecordsService],
  exports: [ModuleRecordsService],
})
export class ModuleRecordsModule {}
