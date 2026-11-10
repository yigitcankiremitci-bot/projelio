import { Module } from "@nestjs/common";
import { DepartmentMembersController } from "./department-members.controller";
import { DepartmentMembersService } from "./department-members.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { EmailModule } from "../auth/email.module";

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [DepartmentMembersController],
  providers: [DepartmentMembersService],
  exports: [DepartmentMembersService],
})
export class DepartmentMembersModule {}
