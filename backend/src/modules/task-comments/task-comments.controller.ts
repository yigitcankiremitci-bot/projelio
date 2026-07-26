import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TaskCommentsService } from "./task-comments.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class TaskCommentsController {
  constructor(private taskCommentsService: TaskCommentsService) {}

  @Get("tasks/:taskId/comments")
  findByTask(@Param("taskId") taskId: string) {
    return this.taskCommentsService.findByTask(taskId);
  }

  @Get("projects/:projectId/comments")
  findByProject(@Param("projectId") projectId: string, @Req() req: any) {
    return this.taskCommentsService.findByProject(projectId, req.user.userId);
  }

  @Post("tasks/:taskId/comments")
  create(@Param("taskId") taskId: string, @Req() req: any, @Body("body") body: string) {
    return this.taskCommentsService.create(taskId, req.user.userId, body);
  }
}
