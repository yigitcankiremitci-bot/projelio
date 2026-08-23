import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PartnersService } from "./partners.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PartnersController {
  constructor(
    private partnersService: PartnersService,
    private access: AccessService
  ) {}

  // Ortaklık ve hisse oranları: en hassas kurumsal veri. Taşerona tamamen kapalı.
  @Get("organizations/:organizationId/partners")
  async findByOrganization(@Param("organizationId") organizationId: string, @Req() req: any) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partnersService.findByOrganization(organizationId);
  }

  @Post("organizations/:organizationId/partners")
  inviteToOrganization(
    @Param("organizationId") organizationId: string,
    @Body() body: { userId?: string; inviteEmail?: string; equityPercent: number },
    @Req() req: any
  ) {
    return this.partnersService.invite({ organizationId }, body, req.user.userId);
  }

  @Get("groups/:groupId/partners")
  async findByGroup(@Param("groupId") groupId: string, @Req() req: any) {
    await this.access.assertCanViewGroup(groupId, req.user.userId);
    await this.access.assertNotSubcontractor(req.user.userId, "partners");
    return this.partnersService.findByGroup(groupId);
  }

  @Post("groups/:groupId/partners")
  inviteToGroup(
    @Param("groupId") groupId: string,
    @Body() body: { userId?: string; inviteEmail?: string; equityPercent: number },
    @Req() req: any
  ) {
    return this.partnersService.invite({ groupId }, body, req.user.userId);
  }

  @Patch("partners/:id")
  updateEquity(@Param("id") id: string, @Body("equityPercent") equityPercent: number, @Req() req: any) {
    return this.partnersService.updateEquity(id, equityPercent, req.user.userId);
  }

  @Patch("partners/:id/respond")
  respond(@Param("id") id: string, @Body("approve") approve: boolean, @Req() req: any) {
    return this.partnersService.respond(id, approve, req.user.userId);
  }

  @Delete("partners/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.partnersService.remove(id, req.user.userId);
  }

  @Get("partners/:id/module-grants")
  findGrants(@Param("id") id: string, @Req() req: any) {
    return this.partnersService.findGrants(id, req.user.userId);
  }

  @Post("partners/:id/module-grants")
  grantModule(@Param("id") id: string, @Body("moduleKey") moduleKey: string, @Req() req: any) {
    return this.partnersService.grantModule(id, moduleKey, req.user.userId);
  }

  @Delete("partners/:id/module-grants/:moduleKey")
  revokeModule(@Param("id") id: string, @Param("moduleKey") moduleKey: string, @Req() req: any) {
    return this.partnersService.revokeModule(id, moduleKey, req.user.userId);
  }
}
