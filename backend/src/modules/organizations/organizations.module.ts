import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { JobsModule } from "../jobs/jobs.module";

@Module({
  imports: [JobsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
