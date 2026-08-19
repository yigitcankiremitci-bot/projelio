import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { DepartmentMembersService } from "./department-members.service";
import type { DepartmentMember } from "@projelio/shared";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class DepartmentMembersController {
  constructor(private departmentMembersService: DepartmentMembersService) {}

  // Taşeron kadro listesini göremez; yalnızca kendi (varsa bekleyen) kaydını
  // alır — bkz. DepartmentMembersService.canViewRoster.
  @Get("departments/:departmentId/members")
  findByDepartment(@Param("departmentId") departmentId: string, @Req() req: any) {
    return this.departmentMembersService.findByDepartment(departmentId, req.user.userId);
  }

  @Post("departments/:departmentId/members")
  invite(
    @Param("departmentId") departmentId: string,
    @Body() body: { userId?: string; inviteEmail?: string; role?: DepartmentMember["role"]; title?: string },
    @Req() req: any
  ) {
    return this.departmentMembersService.invite(departmentId, body, req.user.userId);
  }

  @Patch("department-members/:id")
  update(
    @Param("id") id: string,
    @Body() body: { role?: DepartmentMember["role"]; title?: string; reportsTo?: string },
    @Req() req: any
  ) {
    return this.departmentMembersService.updatePosition(id, body, req.user.userId);
  }

  @Patch("department-members/:id/respond")
  respond(@Param("id") id: string, @Body("approve") approve: boolean, @Req() req: any) {
    return this.departmentMembersService.respond(id, approve, req.user.userId);
  }

  // Kendi isteğiyle ayrılma: yöneticinin çıkarmasından ayrı bir uç, çünkü
  // yetki kuralı farklı (org sahipliği değil, kaydın sahibi olmak).
  @Patch("departments/:departmentId/members/me/leave")
  leave(@Param("departmentId") departmentId: string, @Req() req: any) {
    return this.departmentMembersService.leave(departmentId, req.user.userId);
  }

  // Son yöneticinin ayrılma talebine organizasyon sahibinin yanıtı (bkz. 061).
  @Patch("department-members/:id/leave-request/respond")
  respondToLeaveRequest(@Param("id") id: string, @Body("approve") approve: boolean, @Req() req: any) {
    return this.departmentMembersService.respondToLeaveRequest(id, approve, req.user.userId);
  }

  @Patch("department-members/:id/remove")
  remove(@Param("id") id: string, @Body("accessUntil") accessUntil: string | undefined, @Req() req: any) {
    return this.departmentMembersService.remove(id, accessUntil, req.user.userId);
  }
}
