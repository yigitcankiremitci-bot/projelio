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

  @Get("departments/:departmentId/posts")
  findByDepartment(@Param("departmentId") departmentId: string, @Req() req: any) {
    return this.projectPostsService.findByDepartment(departmentId, req.user.userId);
  }

  @Post("departments/:departmentId/posts")
  createForDepartment(@Param("departmentId") departmentId: string, @Req() req: any, @Body("body") body: string) {
    return this.projectPostsService.createForDepartment(departmentId, req.user.userId, body);
  }

  // Şirket/işletme anasayfasındaki "Sosyal" sekmesi: organizasyona doğrudan yapılan
  // paylaşımlar + organizasyona bağlı tüm departmanların akışları birlikte döner.
  @Get("organizations/:organizationId/posts")
  findByOrganization(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.projectPostsService.findByOrganization(organizationId, req.user.userId);
  }

  @Post("organizations/:organizationId/posts")
  createForOrganization(@Param("organizationId") organizationId: string, @Req() req: any, @Body("body") body: string) {
    return this.projectPostsService.createForOrganization(organizationId, req.user.userId, body);
  }

  @Post("posts/:postId/like")
  toggleLike(@Param("postId") postId: string, @Req() req: any) {
    return this.projectPostsService.toggleLike(postId, req.user.userId);
  }
}
