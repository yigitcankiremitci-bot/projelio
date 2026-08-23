import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ModuleRecordsService } from "./module-records.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class ModuleRecordsController {
  constructor(
    private moduleRecordsService: ModuleRecordsService,
    private access: AccessService
  ) {}

  // Yalnızca kullanıcının OKUYABİLDİĞİ modüllerin kayıtları döner
  // (bkz. ModuleRecordsService.findByOrganization — modül/departman yetkisi).
  @Get("organizations/:organizationId/module-records")
  findByOrganization(
    @Param("organizationId") organizationId: string,
    @Req() req: any,
    @Query("moduleKey") moduleKey?: string
  ) {
    return this.moduleRecordsService.findByOrganization(organizationId, moduleKey, req.user.userId);
  }

  @Post("organizations/:organizationId/module-records")
  create(
    @Param("organizationId") organizationId: string,
    @Body() body: { departmentId?: string; moduleKey?: string; data?: Record<string, unknown>; scopeRef?: string },
    @Req() req: any
  ) {
    return this.moduleRecordsService.create(organizationId, body, req.user.userId);
  }

  // Modül kullanım göstergeleri — sekme yerleşiminin girdisi (sayfa başına tek
  // sorgu). Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §4
  @Get("organizations/:organizationId/module-stats")
  organizationStats(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.moduleRecordsService.organizationModuleStats(organizationId, req.user.userId);
  }

  // Serbest çalışan anasayfası: kullanıcının kendi işlerindeki modüller.
  @Get("me/module-stats")
  myStats(@Req() req: any) {
    return this.moduleRecordsService.myJobModuleStats(req.user.userId);
  }

  // Serbest çalışan tarafı: kayıtlar organizasyona değil, modülün atandığı işe bağlı.
  @Get("jobs/:jobId/module-records")
  async findByJob(@Param("jobId") jobId: string, @Req() req: any, @Query("moduleKey") moduleKey?: string) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
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

  // Silme değil arşivleme — kayıt listeden düşer ama veritabanında kalır.
  @Delete("module-records/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.moduleRecordsService.remove(id, req.user.userId);
  }

  @Patch("module-records/:id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.moduleRecordsService.restore(id, req.user.userId);
  }

  // ---- A1 (Form / Doküman): taslak, onay, sürüm ----
  // Yürürlükteki metni yalnızca /approve değiştirir; /draft okuma görünümüne
  // dokunmaz. Bkz. docs/moduller/20-motor-a1-form.md

  @Patch("module-records/:id/draft")
  saveDraft(@Param("id") id: string, @Body("data") data: Record<string, unknown>, @Req() req: any) {
    return this.moduleRecordsService.saveDraft(id, data ?? {}, req.user.userId);
  }

  @Delete("module-records/:id/draft")
  discardDraft(@Param("id") id: string, @Req() req: any) {
    return this.moduleRecordsService.discardDraft(id, req.user.userId);
  }

  @Post("module-records/:id/approve")
  approve(@Param("id") id: string, @Body("note") note: string | undefined, @Req() req: any) {
    return this.moduleRecordsService.approve(id, note, req.user.userId);
  }

  @Get("module-records/:id/versions")
  listVersions(@Param("id") id: string, @Req() req: any) {
    return this.moduleRecordsService.listVersions(id, req.user.userId);
  }

  // Sürüme dönüş taslağa yükler, yayımlamaz — kullanıcı okuyup onaylar.
  @Post("module-records/:id/versions/:versionId/revert")
  revert(@Param("id") id: string, @Param("versionId") versionId: string, @Req() req: any) {
    return this.moduleRecordsService.revertToVersion(id, versionId, req.user.userId);
  }
}
