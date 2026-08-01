import { Module } from "@nestjs/common";
import { OutputsController } from "./outputs.controller";
import { OutputsService } from "./outputs.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [OutputsController],
  providers: [OutputsService],
  exports: [OutputsService],
})
export class OutputsModule {}
