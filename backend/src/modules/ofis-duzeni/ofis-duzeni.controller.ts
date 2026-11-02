import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { EN_COK_KARAKTER_SORGUSU, ODA_KIMLIGI } from "@projelio/shared";
import { AccessService } from "../../common/access/access.service";
import { OfisDuzeniService } from "./ofis-duzeni.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // ------------------------------------------------------------ Stüdyom (migration 175)
  // Şirketsiz: kullanıcının serbest işlerinin odaları + kendi ortak alanı ve
  // görüşme odası. Görmek için kendi stüdyosu olması yeter; yetki serviste.

  @Get("ofis-duzeni/studyo")
  studyoGetir(@Req() req: any) {
    return this.service.studyoGetir(req.user.userId);
  }

  @Post("ofis-duzeni/studyo/:odaId")
  studyoKaydet(@Param("odaId") odaId: string, @Body() body: unknown, @Req() req: any) {
    if (!ODA_KIMLIGI.test(odaId)) throw new BadRequestException("Geçersiz oda");
    return this.service.studyoKaydet(odaId, body, req.user.userId);
  }

  @Delete("ofis-duzeni/studyo/:odaId")
  async studyoSifirla(@Param("odaId") odaId: string, @Req() req: any) {
    if (!ODA_KIMLIGI.test(odaId)) throw new BadRequestException("Geçersiz oda");
    await this.service.studyoSifirla(odaId, req.user.userId);
    return { ok: true };
  }

  // ------------------------------------------------------------ Karakterler (migration 182)
  // Ofisteki karakterin görünümü kişinin kendisine ait; okuma herkese açık.

  /** Virgülle ayrılmış kullanıcı kimliklerinin karakter görünümleri (kaydı olmayan yanıtta yok). */
  @Get("ofis-duzeni/karakterler")
  karakterler(@Query("kisiler") kisiler?: string) {
    const ids = [...new Set((kisiler ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
    if (ids.length > EN_COK_KARAKTER_SORGUSU || ids.some((id) => !UUID.test(id))) throw new BadRequestException("Geçersiz kişi listesi");
    return this.service.karakterler(ids);
  }

  /** Kendi karakterini kaydeder. */
  @Post("ofis-duzeni/karakter")
  karakterKaydet(@Body() body: unknown, @Req() req: any) {
    return this.service.karakterKaydet(req.user.userId, body);
  }
}
