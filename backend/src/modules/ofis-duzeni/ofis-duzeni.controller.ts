import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ODA_KIMLIGI } from "@projelio/shared";
import { AccessService } from "../../common/access/access.service";
import { OfisDuzeniService } from "./ofis-duzeni.service";

// 3D ofisteki oda düzenleri (bkz. migration 171, shared ofisDuzeni.ts).
@Controller()
@UseGuards(AuthGuard("jwt"))
export class OfisDuzeniController {
  constructor(
    private service: OfisDuzeniService,
    private access: AccessService
  ) {}

  /** Şirketin bütün oda düzenleri + isteyenin hangi odaları düzenleyebileceği. */
  @Get("organizations/:organizationId/ofis-duzeni")
  async getir(@Param("organizationId") organizationId: string, @Req() req: any) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    return this.service.getir(organizationId, req.user.userId);
  }

  @Post("organizations/:organizationId/ofis-duzeni/:odaId")
  async kaydet(
    @Param("organizationId") organizationId: string,
    @Param("odaId") odaId: string,
    @Body() body: unknown,
    @Req() req: any
  ) {
    if (!ODA_KIMLIGI.test(odaId)) throw new BadRequestException("Geçersiz oda");
    return this.service.kaydet(organizationId, odaId, body, req.user.userId);
  }

  /** Odayı varsayılan düzenine döndürür. */
  @Delete("organizations/:organizationId/ofis-duzeni/:odaId")
  async sifirla(@Param("organizationId") organizationId: string, @Param("odaId") odaId: string, @Req() req: any) {
    if (!ODA_KIMLIGI.test(odaId)) throw new BadRequestException("Geçersiz oda");
    await this.service.sifirla(organizationId, odaId, req.user.userId);
    return { ok: true };
  }
}
