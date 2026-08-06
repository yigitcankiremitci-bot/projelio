import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OrganizationModulesService } from "./organization-modules.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class OrganizationModulesController {
  constructor(private organizationModulesService: OrganizationModulesService) {}

  @Get("organizations/:organizationId/modules")
  findByOrganization(@Param("organizationId") organizationId: string) {
    return this.organizationModulesService.findByOrganization(organizationId);
  }

  @Post("organizations/:organizationId/modules")
  enable(
    @Param("organizationId") organizationId: string,
    @Body() body: { moduleKey?: string; moduleKeys?: string[] },
    @Req() req: any
  ) {
    if (body.moduleKeys?.length) {
      return this.organizationModulesService.enableMany(organizationId, body.moduleKeys, req.user.userId);
    }
    return this.organizationModulesService.enable(organizationId, body.moduleKey!, req.user.userId);
  }

  @Delete("organizations/:organizationId/modules/:moduleKey")
  disable(@Param("organizationId") organizationId: string, @Param("moduleKey") moduleKey: string, @Req() req: any) {
    return this.organizationModulesService.disable(organizationId, moduleKey, req.user.userId);
  }
}
