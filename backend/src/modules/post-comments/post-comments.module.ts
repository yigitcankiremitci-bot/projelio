import { Module } from "@nestjs/common";
import { PostCommentsController } from "./post-comments.controller";
import { PostCommentsService } from "./post-comments.service";
import { MembersModule } from "../members/members.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [MembersModule, NotificationsModule],
  controllers: [PostCommentsController],
  providers: [PostCommentsService],
  exports: [PostCommentsService],
})
export class PostCommentsModule {}
