import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ProjectPostsService } from "./project-posts.service";
import { AccessService } from "../../common/access/access.service";
import { requireUuid } from "../../common/validation/input";

// Sosyal akış, yazıldığı kapsamın (proje / departman / organizasyon) görünürlüğünü
// devralır. Okuma ve yazma aynı kapıdan geçer: paylaşım oluşturmak kapsamdaki HERKESE
// bildirim gönderdiği için, yetkisiz yazma dışarıdan bildirim yağdırmaya dönüşüyordu.
@Controller()
@UseGuards(AuthGuard("jwt"))
export class ProjectPostsController {
  constructor(
    private projectPostsService: ProjectPostsService,
    private access: AccessService
  ) {}

  @Get("projects/:projectId/posts")
  async findByProject(@Param("projectId") projectId: string, @Req() req: any) {
    await this.access.assertCanViewProject(projectId, req.user.userId);
    return this.projectPostsService.findByProject(projectId, req.user.userId);
  }

  @Post("projects/:projectId/posts")
  async create(@Param("projectId") projectId: string, @Req() req: any, @Body("body") body: string) {
    await this.access.assertCanViewProject(projectId, req.user.userId);
    return this.projectPostsService.create(projectId, req.user.userId, body);
  }

  @Get("departments/:departmentId/posts")
  async findByDepartment(@Param("departmentId") departmentId: string, @Req() req: any) {
    await this.access.assertCanViewDepartment(departmentId, req.user.userId);
    return this.projectPostsService.findByDepartment(departmentId, req.user.userId);
  }

  @Post("departments/:departmentId/posts")
  async createForDepartment(@Param("departmentId") departmentId: string, @Req() req: any, @Body("body") body: string) {
    await this.access.assertCanViewDepartment(departmentId, req.user.userId);
    return this.projectPostsService.createForDepartment(departmentId, req.user.userId, body);
  }

  // Şirket/işletme anasayfasındaki "Sosyal" sekmesi: organizasyona doğrudan yapılan
  // paylaşımlar + organizasyona bağlı tüm departmanların akışları birlikte döner.
  @Get("organizations/:organizationId/posts")
  async findByOrganization(@Param("organizationId") organizationId: string, @Req() req: any) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    return this.projectPostsService.findByOrganization(organizationId, req.user.userId);
  }

  @Post("organizations/:organizationId/posts")
  async createForOrganization(@Param("organizationId") organizationId: string, @Req() req: any, @Body("body") body: string) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    return this.projectPostsService.createForOrganization(organizationId, req.user.userId, body);
  }

  // Kişisel duvar ve sosyal sayfa akışı (migration 134). Duvarı sahibi ve
  // arkadaşları görür ve yazar; iş/şirket ilişkisi burada hiçbir şey açmaz.
  @Get("sosyal/akis")
  socialFeed(@Req() req: any) {
    return this.projectPostsService.findSocialFeed(req.user.userId);
  }

  @Get("sosyal/duvar/:userId")
  async findWall(@Param("userId") userId: string, @Req() req: any) {
    await this.access.assertCanViewWall(requireUuid(userId, "Kullanıcı"), req.user.userId);
    return this.projectPostsService.findWall(userId, req.user.userId);
  }

  @Post("sosyal/duvar/:userId")
  async createOnWall(@Param("userId") userId: string, @Req() req: any, @Body("body") body: string) {
    await this.access.assertCanViewWall(requireUuid(userId, "Kullanıcı"), req.user.userId);
    return this.projectPostsService.createOnWall(userId, req.user.userId, body);
  }

  @Delete("sosyal/paylasim/:postId")
  async deleteWallPost(@Param("postId") postId: string, @Req() req: any) {
    await this.projectPostsService.deleteWallPost(postId, req.user.userId);
    return { ok: true };
  }

  @Post("posts/:postId/like")
  async toggleLike(@Param("postId") postId: string, @Req() req: any) {
    await this.access.assertCanViewPost(postId, req.user.userId);
    return this.projectPostsService.toggleLike(postId, req.user.userId);
  }
}
