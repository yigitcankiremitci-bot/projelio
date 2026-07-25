import { Module } from "@nestjs/common";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";
import { DeadlineReminderProcessor } from "./deadline-reminder.processor";

@Module({
  providers: [NotificationsGateway, NotificationsService, DeadlineReminderProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
