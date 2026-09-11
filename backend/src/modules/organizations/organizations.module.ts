import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { JobsModule } from "../jobs/jobs.module";
import { DepartmentMembersModule } from "../department-members/department-members.module";

@Module({
  imports: [JobsModule, DepartmentMembersModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
