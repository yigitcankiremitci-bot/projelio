import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { ModuleMemberRole } from "@projelio/shared";
import { ModuleMembersService } from "./module-members.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ModuleMembersController {
  constructor(private moduleMembersService: ModuleMembersService) {}

  // ============================================================ Organizasyon

  @Get("organizations/:organizationId/module-members")
  findByOrganizationModule(
    @Param("organizationId") organizationId: string,
    @Query("moduleKey") moduleKey: string,
    @Query("departmentId") departmentId?: string
  ) {
    return this.moduleMembersService.findByOrganizationModule(organizationId, moduleKey, departmentId);
  }

  /** Modül panelini render ederken hangi eylemlerin gösterileceğini belirler. */
  @Get("organizations/:organizationId/module-access")
  organizationAccess(
    @Param("organizationId") organizationId: string,
    @Query("moduleKey") moduleKey: string,
    @Req() req: any,
    @Query("departmentId") departmentId?: string
  ) {
    return this.moduleMembersService.resolveOrganizationAccess(organizationId, moduleKey, req.user.userId, departmentId);
  }

  @Post("organizations/:organizationId/module-members")
  assign(
    @Param("organizationId") organizationId: string,
    @Body() body: { moduleKey?: string; departmentId?: string; userId?: string; inviteEmail?: string; role?: ModuleMemberRole },
    @Req() req: any
  ) {
    return this.moduleMembersService.assign({ organizationId }, body, req.user.userId);
  }

  // ============================================================ Serbest çalışan

  @Get("jobs/:jobId/module-members")
  findByJobModule(@Param("jobId") jobId: string, @Query("moduleKey") moduleKey: string) {
    return this.moduleMembersService.findByJobModule(jobId, moduleKey);
  }

  @Get("jobs/:jobId/module-access")
  jobAccess(@Param("jobId") jobId: string, @Query("moduleKey") moduleKey: string, @Req() req: any) {
    return this.moduleMembersService.resolveJobAccess(jobId, moduleKey, req.user.userId);
  }

  @Post("jobs/:jobId/module-members")
  assignForJob(
    @Param("jobId") jobId: string,
    @Body() body: { moduleKey?: string; userId?: string; inviteEmail?: string; role?: ModuleMemberRole },
    @Req() req: any
  ) {
    return this.moduleMembersService.assign({ jobId }, body, req.user.userId);
  }

  // ============================================================ Ortak

  /** Anasayfada "bana atanan modüller" listesi için. */
  @Get("me/module-members")
  findAssigned(@Req() req: any) {
    return this.moduleMembersService.findAssignedModules(req.user.userId);
  }

  @Patch("module-members/:id")
  updateRole(@Param("id") id: string, @Body("role") role: ModuleMemberRole, @Req() req: any) {
    return this.moduleMembersService.updateRole(id, role, req.user.userId);
  }

  @Delete("module-members/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.moduleMembersService.remove(id, req.user.userId);
  }
}
