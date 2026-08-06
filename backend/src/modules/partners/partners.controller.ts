import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PartnersService } from "./partners.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PartnersController {
  constructor(private partnersService: PartnersService) {}

  @Get("organizations/:organizationId/partners")
  findByOrganization(@Param("organizationId") organizationId: string) {
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
  findByGroup(@Param("groupId") groupId: string) {
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
  findGrants(@Param("id") id: string) {
    return this.partnersService.findGrants(id);
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
