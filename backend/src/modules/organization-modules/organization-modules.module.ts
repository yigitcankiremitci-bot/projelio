import { Module } from "@nestjs/common";
import { OrganizationModulesController } from "./organization-modules.controller";
import { OrganizationModulesService } from "./organization-modules.service";

@Module({
  controllers: [OrganizationModulesController],
  providers: [OrganizationModulesService],
  exports: [OrganizationModulesService],
})
export class OrganizationModulesModule {}
