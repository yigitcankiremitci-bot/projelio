import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ModuleRecordsService } from "./module-records.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ModuleRecordsController {
  constructor(private moduleRecordsService: ModuleRecordsService) {}

  @Get("organizations/:organizationId/module-records")
  findByOrganization(@Param("organizationId") organizationId: string, @Query("moduleKey") moduleKey?: string) {
    return this.moduleRecordsService.findByOrganization(organizationId, moduleKey);
  }

  @Post("organizations/:organizationId/module-records")
  create(
    @Param("organizationId") organizationId: string,
    @Body() body: { departmentId?: string; moduleKey?: string; data?: Record<string, unknown> },
    @Req() req: any
  ) {
    return this.moduleRecordsService.create(organizationId, body, req.user.userId);
  }

  // Serbest çalışan tarafı: kayıtlar organizasyona değil, modülün atandığı işe bağlı.
  @Get("jobs/:jobId/module-records")
  findByJob(@Param("jobId") jobId: string, @Query("moduleKey") moduleKey?: string) {
    return this.moduleRecordsService.findByJob(jobId, moduleKey);
  }

  @Post("jobs/:jobId/module-records")
  createForJob(
    @Param("jobId") jobId: string,
    @Body() body: { moduleKey?: string; data?: Record<string, unknown> },
    @Req() req: any
  ) {
    return this.moduleRecordsService.createForJob(jobId, body, req.user.userId);
  }

  @Patch("module-records/:id")
  update(@Param("id") id: string, @Body("data") data: Record<string, unknown>, @Req() req: any) {
    return this.moduleRecordsService.update(id, data, req.user.userId);
  }

  @Delete("module-records/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.moduleRecordsService.remove(id, req.user.userId);
  }
}
