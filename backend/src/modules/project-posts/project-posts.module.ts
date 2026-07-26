import { Module } from "@nestjs/common";
import { ProjectPostsController } from "./project-posts.controller";
import { ProjectPostsService } from "./project-posts.service";
import { MembersModule } from "../members/members.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [MembersModule, NotificationsModule],
  controllers: [ProjectPostsController],
  providers: [ProjectPostsService],
  exports: [ProjectPostsService],
})
export class ProjectPostsModule {}
