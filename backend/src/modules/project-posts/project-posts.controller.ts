import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ProjectPostsService } from "./project-posts.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ProjectPostsController {
  constructor(private projectPostsService: ProjectPostsService) {}

  @Get("projects/:projectId/posts")
  findByProject(@Param("projectId") projectId: string) {
    return this.projectPostsService.findByProject(projectId);
  }

  @Post("projects/:projectId/posts")
  create(@Param("projectId") projectId: string, @Req() req: any, @Body("body") body: string) {
    return this.projectPostsService.create(projectId, req.user.userId, body);
  }
}
