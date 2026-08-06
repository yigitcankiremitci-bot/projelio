import { Module } from "@nestjs/common";
import { DepartmentMembersController } from "./department-members.controller";
import { DepartmentMembersService } from "./department-members.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [DepartmentMembersController],
  providers: [DepartmentMembersService],
  exports: [DepartmentMembersService],
})
export class DepartmentMembersModule {}
