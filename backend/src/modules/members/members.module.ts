import { Module } from "@nestjs/common";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule, FilesModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
