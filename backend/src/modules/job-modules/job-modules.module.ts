import { Module } from "@nestjs/common";
import { JobModulesController } from "./job-modules.controller";
import { JobModulesService } from "./job-modules.service";

@Module({
  controllers: [JobModulesController],
  providers: [JobModulesService],
  exports: [JobModulesService],
})
export class JobModulesModule {}
