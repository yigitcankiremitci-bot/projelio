import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { AccountDeletionService } from "./account-deletion.service";
import { EmailModule } from "../auth/email.module";
import { AccountExportService } from "./account-export.service";
import { AccountPurgeProcessor } from "./account-purge.processor";
import { OrganizationsModule } from "../organizations/organizations.module";
import { GroupsModule } from "../groups/groups.module";

@Module({
  imports: [OrganizationsModule, GroupsModule, EmailModule],
  controllers: [UsersController],
  providers: [UsersService, AccountDeletionService, AccountExportService, AccountPurgeProcessor],
  exports: [UsersService, AccountDeletionService],
})
export class UsersModule {}
