import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ProjeSablonlariService } from "./proje-sablonlari.service";

/**
 * Proje klonlama + şablonlar (bkz. ProjeSablonlariService, migration 194).
 * Gövdeler serbest biçimli: doğrulama shared projeSablonu.ts'ten ve serviste.
 */
@Controller("proje-sablonlari")
@UseGuards(AuthGuard("jwt"))
export class ProjeSablonlariController {
  constructor(private servis: ProjeSablonlariService) {}

  @Get()
  liste(@Req() req: any) {
    return this.servis.liste(req.user.userId);
  }

  /** Şirket şablonu kaydedilebilecek şirketler. "/:id" ile çakışmasın diye önce. */
  @Get("sirketler")
  sirketler(@Req() req: any) {
    return this.servis.sirketSecenekleri(req.user.userId);
  }

  @Post("klonla")
  klonla(@Req() req: any, @Body() body: any) {
    return this.servis.klonla(req.user.userId, body ?? {});
  }

  @Post()
  kaydet(@Req() req: any, @Body() body: any) {
    return this.servis.kaydet(req.user.userId, body ?? {});
  }

  @Post(":id/proje")
  kullan(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.servis.kullan(req.user.userId, id, body ?? {});
  }

  @Delete(":id")
  sil(@Req() req: any, @Param("id") id: string) {
    return this.servis.sil(req.user.userId, id);
  }
}
