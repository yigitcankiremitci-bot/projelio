import { Module } from "@nestjs/common";
import { TaskCommentsController } from "./task-comments.controller";
import { TaskCommentsService } from "./task-comments.service";

@Module({
  controllers: [TaskCommentsController],
  providers: [TaskCommentsService],
  exports: [TaskCommentsService],
})
export class TaskCommentsModule {}
