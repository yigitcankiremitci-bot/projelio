import { Module } from "@nestjs/common";
import { TaskCommentsController } from "./task-comments.controller";
import { TaskCommentsService } from "./task-comments.service";
import { TasksModule } from "../tasks/tasks.module";

@Module({
  imports: [TasksModule],
  controllers: [TaskCommentsController],
  providers: [TaskCommentsService],
  exports: [TaskCommentsService],
})
export class TaskCommentsModule {}
