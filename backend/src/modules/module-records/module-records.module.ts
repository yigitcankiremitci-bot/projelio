import { Module } from "@nestjs/common";
import { ModuleMembersModule } from "../module-members/module-members.module";
import { ModuleRecordsController } from "./module-records.controller";
import { ModuleRecordsService } from "./module-records.service";

@Module({
  // Modül yetkisi (kim yazabilir) ModuleMembersService'te tek yerde çözülüyor.
  imports: [ModuleMembersModule],
  controllers: [ModuleRecordsController],
  providers: [ModuleRecordsService],
  exports: [ModuleRecordsService],
})
export class ModuleRecordsModule {}
