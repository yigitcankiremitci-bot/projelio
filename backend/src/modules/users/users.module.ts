import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { OrganizationsModule } from "../organizations/organizations.module";
import { GroupsModule } from "../groups/groups.module";

@Module({
  imports: [OrganizationsModule, GroupsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
