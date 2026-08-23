import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TaskCommentsService } from "./task-comments.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class TaskCommentsController {
  constructor(
    private taskCommentsService: TaskCommentsService,
    private access: AccessService
  ) {}

  // Yorumlar görevin, görev de projesinin/departmanının görünürlüğünü devralır.
  @Get("tasks/:taskId/comments")
  async findByTask(@Param("taskId") taskId: string, @Req() req: any) {
    await this.access.assertCanViewTask(taskId, req.user.userId);
    return this.taskCommentsService.findByTask(taskId);
  }

  // Servisteki taşeron filtresi yetki kontrolü DEĞİL: projeyle hiç ilgisi olmayan
  // kullanıcı için null döner, yani filtre uygulanmaz. Kapıyı burada tutuyoruz.
  @Get("projects/:projectId/comments")
  async findByProject(@Param("projectId") projectId: string, @Req() req: any) {
    await this.access.assertCanViewProject(projectId, req.user.userId);
    return this.taskCommentsService.findByProject(projectId, req.user.userId);
  }

  @Post("tasks/:taskId/comments")
  async create(@Param("taskId") taskId: string, @Req() req: any, @Body("body") body: string) {
    await this.access.assertCanViewTask(taskId, req.user.userId);
    return this.taskCommentsService.create(taskId, req.user.userId, body);
  }
}
