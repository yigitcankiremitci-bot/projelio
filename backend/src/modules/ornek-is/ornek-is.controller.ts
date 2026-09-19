import { Controller, Delete, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OrnekIsService } from "./ornek-is.service";

/**
 * Örnek iş — yalnızca oturum sahibinin KENDİ örnek işi. Kimlik parametresi
 * bilerek yok: başkasının örneğini açmak ya da silmek diye bir işlem yok.
 */
@Controller("ornek-is")
@UseGuards(AuthGuard("jwt"))
export class OrnekIsController {
  constructor(private ornekIs: OrnekIsService) {}

  @Get()
  durum(@Req() req: any) {
    return this.ornekIs.durum(req.user.userId);
  }

  /** Ayarlar > Yardımcılar'daki "Örnek iş ekle" — varsa mevcut olanı döndürür. */
  @Post()
  olustur(@Req() req: any) {
    return this.ornekIs.olustur(req.user.userId);
  }

  @Delete()
  sil(@Req() req: any) {
    return this.ornekIs.sil(req.user.userId);
  }
}
