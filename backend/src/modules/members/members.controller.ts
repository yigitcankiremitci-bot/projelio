import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { MembersService } from "./members.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class MembersController {
  constructor(private membersService: MembersService) {}

  @Get("projects/:projectId/members")
  findByProject(@Param("projectId") projectId: string, @Req() req: any) {
    return this.membersService.findByProject(projectId, req.user.userId);
  }

  @Post("projects/:projectId/members/invite")
  invite(@Param("projectId") projectId: string, @Body() body: { userId: string; role?: any }, @Req() req: any) {
    return this.membersService.invite(projectId, body.userId, body.role, req.user.userId);
  }

  @Post("projects/:projectId/members")
  addMember(@Param("projectId") projectId: string, @Body() body: { userId: string; role?: any; title?: string }, @Req() req: any) {
    return this.membersService.addMember(projectId, body.userId, body.role, body.title, req.user.userId);
  }

  // Projeden ayrılma. Yöneticinin üye çıkarmasından ayrı: yetki kuralı
  // "yönetici olmak" değil "o üyelik benim olmak".
  @Delete("projects/:projectId/members/me")
  leaveProject(@Param("projectId") projectId: string, @Req() req: any) {
    return this.membersService.leaveProject(projectId, req.user.userId);
  }

  @Patch("members/:id/budget-visibility")
  setBudgetVisibility(@Param("id") id: string, @Body("canViewBudget") canViewBudget: boolean, @Req() req: any) {
    return this.membersService.setBudgetVisibility(id, canViewBudget, req.user.userId);
  }

  @Patch("members/:id/title")
  setTitle(@Param("id") id: string, @Body("title") title: string, @Req() req: any) {
    return this.membersService.setTitle(id, title, req.user.userId);
  }

  // NOT: userId artık body'den değil, giriş yapmış kullanıcıdan alınıyor —
  // aksi halde biri başkası adına katılım isteği açabilirdi.
  @Post("projects/:projectId/members/join-request")
  requestToJoin(@Param("projectId") projectId: string, @Req() req: any) {
    return this.membersService.requestToJoin(projectId, req.user.userId);
  }

  @Patch("members/:id/respond")
  respond(@Param("id") id: string, @Body("approve") approve: boolean, @Req() req: any) {
    return this.membersService.respond(id, approve, req.user.userId);
  }

  @Patch("members/:id/rate")
  setRate(@Param("id") id: string, @Body("rate") rate: number, @Req() req: any) {
    return this.membersService.setRate(id, rate, req.user.userId);
  }
}
