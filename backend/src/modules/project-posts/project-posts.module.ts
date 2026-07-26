import { Module } from "@nestjs/common";
import { ProjectPostsController } from "./project-posts.controller";
import { ProjectPostsService } from "./project-posts.service";

@Module({
  controllers: [ProjectPostsController],
  providers: [ProjectPostsService],
  exports: [ProjectPostsService],
})
export class ProjectPostsModule {}
