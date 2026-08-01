import { Module } from "@nestjs/common";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [JobsModule, OrganizationsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
