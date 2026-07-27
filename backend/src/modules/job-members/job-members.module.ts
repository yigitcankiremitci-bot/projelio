import { Module } from "@nestjs/common";
import { JobMembersController } from "./job-members.controller";
import { JobMembersService } from "./job-members.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [JobMembersController],
  providers: [JobMembersService],
  exports: [JobMembersService],
})
export class JobMembersModule {}
