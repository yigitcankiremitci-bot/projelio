import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { KartvizitService } from "./kartvizit.service";

/**
 * Kullanıcının kendi dijital kartviziti. Ücretsiz, her hesap tipinde açık:
 * abonelik/plan kapısı BİLEREK YOK.
 */
@Controller("kartvizit")
@UseGuards(AuthGuard("jwt"))
export class KartvizitController {
  constructor(private kartvizit: KartvizitService) {}

  @Get("me")
  durum(@Req() req: any) {
    return this.kartvizit.durum(req.user.userId);
  }

  /** Oluştur ya da güncelle (kullanıcı başına tek kart). */
  @Post("me")
  kaydet(@Req() req: any, @Body() body: unknown) {
    return this.kartvizit.kaydet(req.user.userId, body);
  }

  @Delete("me")
  sil(@Req() req: any) {
    return this.kartvizit.sil(req.user.userId);
  }

  /** Formda yazarken: ?adresler=ali,ali-veli → { ali: false, "ali-veli": true }. */
  @Get("adres-durumu")
  adresDurumu(@Req() req: any, @Query("adresler") adresler?: string) {
    return this.kartvizit.adresDurumu(req.user.userId, (adresler ?? "").split(",").filter(Boolean));
  }
}
