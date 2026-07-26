import { Module } from "@nestjs/common";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { DeadlineReminderProcessor } from "./deadline-reminder.processor";
import { DigestProcessor } from "./digest.processor";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsGateway, NotificationsService, DeadlineReminderProcessor, DigestProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
