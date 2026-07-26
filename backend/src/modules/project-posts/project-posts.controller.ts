import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ProjectPostsService } from "./project-posts.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ProjectPostsController {
  constructor(private projectPostsService: ProjectPostsService) {}

  @Get("projects/:projectId/posts")
  findByProject(@Param("projectId") projectId: string, @Req() req: any) {
    return this.projectPostsService.findByProject(projectId, req.user.userId);
  }

  @Post("projects/:projectId/posts")
  create(@Param("projectId") projectId: string, @Req() req: any, @Body("body") body: string) {
    return this.projectPostsService.create(projectId, req.user.userId, body);
  }

  @Post("posts/:postId/like")
  toggleLike(@Param("postId") postId: string, @Req() req: any) {
    return this.projectPostsService.toggleLike(postId, req.user.userId);
  }
}
