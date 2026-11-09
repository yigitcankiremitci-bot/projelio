import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PiyasaService } from "./piyasa.service";
import { haberTuruMu } from "./piyasa";

/** Anasayfa panosunun Haber / Döviz / Borsa kartları. Oturum şart: uç bir vekil gibi kullanılmasın. */
@Controller("piyasa")
@UseGuards(AuthGuard("jwt"))
export class PiyasaController {
  constructor(private piyasa: PiyasaService) {}

  @Get("doviz")
  doviz() {
    return this.piyasa.doviz();
  }

  @Get("haberler")
  haberler(@Query("tur") tur?: string) {
    const secilen = tur ?? "gundem";
    if (!haberTuruMu(secilen)) throw new BadRequestException("Geçersiz haber türü");
    return this.piyasa.haberler(secilen);
  }

  @Get("borsa")
  borsa() {
    return this.piyasa.borsa();
  }
}
