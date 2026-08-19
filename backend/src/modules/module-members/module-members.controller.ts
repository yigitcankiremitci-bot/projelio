import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { ModuleMemberRole } from "@projelio/shared";
import { ModuleMembersService } from "./module-members.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ModuleMembersController {
  constructor(
    private moduleMembersService: ModuleMembersService,
    private access: AccessService
  ) {}

  // ============================================================ Organizasyon

  // Modül ekibi listesi isim/e-posta içerir; taşeron modüle atanmış olsa bile
  // ekibi göremez (bkz. shared/types.ts ModuleMemberRole notu).
  @Get("organizations/:organizationId/module-members")
  async findByOrganizationModule(
    @Param("organizationId") organizationId: string,
    @Req() req: any,
    @Query("moduleKey") moduleKey?: string,
    @Query("departmentId") departmentId?: string
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "team");
    return this.moduleMembersService.findByOrganizationModule(organizationId, moduleKey!, departmentId);
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
  async findByJobModule(@Param("jobId") jobId: string, @Req() req: any, @Query("moduleKey") moduleKey?: string) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "team");
    return this.moduleMembersService.findByJobModule(jobId, moduleKey!);
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
