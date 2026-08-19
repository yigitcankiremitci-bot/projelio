import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Party, PartyActivity, PartyContact, PartyRole } from "@projelio/shared";
import { PartyService } from "./party.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PartyController {
  constructor(
    private partyService: PartyService,
    private access: AccessService
  ) {}

  // ============================================================ Organizasyon

  // Müşteri/tedarikçi kayıtları ticari veridir: organizasyonu görebilenlere
  // açık, taşerona kapalı.
  @Get("organizations/:organizationId/party")
  async findByOrganization(
    @Param("organizationId") organizationId: string,
    @Req() req: any,
    @Query("role") role?: PartyRole,
    @Query("departmentId") departmentId?: string
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.findAll({ organizationId, departmentId }, { role });
  }

  @Post("organizations/:organizationId/party")
  create(
    @Param("organizationId") organizationId: string,
    @Body() body: Partial<Party> & { departmentId?: string },
    @Req() req: any
  ) {
    const { departmentId, ...payload } = body;
    return this.partyService.create({ organizationId, departmentId }, payload, req.user.userId);
  }

  /** Kaydetmeden önce "bu kaydı daha önce girmiş olabilirsiniz" kontrolü. */
  @Post("organizations/:organizationId/party/check-duplicates")
  checkOrgDuplicates(
    @Param("organizationId") organizationId: string,
    @Body() body: { displayName?: string; taxNumber?: string; email?: string; excludeId?: string }
  ) {
    return this.partyService.checkDuplicates({ organizationId }, body);
  }

  // ============================================================ Serbest çalışan

  @Get("jobs/:jobId/party")
  async findByJob(@Param("jobId") jobId: string, @Req() req: any, @Query("role") role?: PartyRole) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partyService.findAll({ jobId }, { role });
  }

  @Post("jobs/:jobId/party")
  createForJob(@Param("jobId") jobId: string, @Body() body: Partial<Party>, @Req() req: any) {
    return this.partyService.create({ jobId }, body, req.user.userId);
  }

  @Post("jobs/:jobId/party/check-duplicates")
  checkJobDuplicates(
    @Param("jobId") jobId: string,
    @Body() body: { displayName?: string; taxNumber?: string; email?: string; excludeId?: string }
  ) {
    return this.partyService.checkDuplicates({ jobId }, body);
  }

  // ============================================================ Tekil kayıt

  @Get("party/:id")
  findOne(@Param("id") id: string) {
    return this.partyService.findOne(id);
  }

  @Patch("party/:id")
  update(@Param("id") id: string, @Body() body: Partial<Party>, @Req() req: any) {
    return this.partyService.update(id, body, req.user.userId);
  }

  // Silme değil arşivleme: geçmiş kayıtlardaki referanslar korunur.
  @Delete("party/:id")
  archive(@Param("id") id: string, @Req() req: any) {
    return this.partyService.archive(id, req.user.userId);
  }

  @Patch("party/:id/restore")
  restore(@Param("id") id: string, @Req() req: any) {
    return this.partyService.restore(id, req.user.userId);
  }

  @Patch("party/:id/roles")
  addRole(@Param("id") id: string, @Body("role") role: PartyRole, @Req() req: any) {
    return this.partyService.addRoleTo(id, role, req.user.userId);
  }

  @Post("party/:id/merge")
  merge(@Param("id") sourceId: string, @Body("targetId") targetId: string, @Req() req: any) {
    return this.partyService.merge(sourceId, targetId, req.user.userId);
  }

  // ============================================================ Kişiler

  @Get("party/:id/contacts")
  findContacts(@Param("id") id: string) {
    return this.partyService.findContacts(id);
  }

  @Post("party/:id/contacts")
  addContact(@Param("id") id: string, @Body() body: Partial<PartyContact>, @Req() req: any) {
    return this.partyService.addContact(id, body, req.user.userId);
  }

  @Delete("party-contacts/:contactId")
  removeContact(@Param("contactId") contactId: string, @Req() req: any) {
    return this.partyService.removeContact(contactId, req.user.userId);
  }

  // ============================================================ Aktivite

  @Get("party/:id/activities")
  findActivities(@Param("id") id: string) {
    return this.partyService.findActivities(id);
  }

  @Post("party/:id/activities")
  addActivity(@Param("id") id: string, @Body() body: Partial<PartyActivity>, @Req() req: any) {
    return this.partyService.addActivity(id, body, req.user.userId);
  }
}
