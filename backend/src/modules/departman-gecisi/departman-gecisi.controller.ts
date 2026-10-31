import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { DepartmanGecisiService } from "./departman-gecisi.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class DepartmanGecisiController {
  constructor(private gecis: DepartmanGecisiService) {}

  /** Giriş yapan sahibin geçişi bekleyen şirketleri (pencere buna göre açılır). */
  @Get("departman-gecisi/bekleyenler")
  bekleyenler(@Req() req: any) {
    return this.gecis.bekleyenler(req.user.userId);
  }

  @Get("organizations/:organizationId/departman-gecisi")
  durum(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.gecis.durum(organizationId, req.user.userId);
  }

  @Post("organizations/:organizationId/departman-gecisi")
  uygula(@Param("organizationId") organizationId: string, @Body() body: { tutulan?: string[] }, @Req() req: any) {
    return this.gecis.uygula(organizationId, req.user.userId, body ?? {});
  }
}
