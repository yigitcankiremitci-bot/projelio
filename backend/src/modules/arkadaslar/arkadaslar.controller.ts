import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ArkadaslarService } from "./arkadaslar.service";

/**
 * Arkadaşlık uçları. Hiçbiri "kimin adına" bilgisini gövdeden almaz; daima
 * oturumdaki kullanıcı. İstek yanıtlama yetkisi (yalnızca alıcı) serviste.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class ArkadaslarController {
  constructor(private arkadaslar: ArkadaslarService) {}

  @Get("arkadaslar")
  ozet(@Req() req: any) {
    return this.arkadaslar.ozet(req.user.userId);
  }

  // NOT: "arkadaslar/:userId" ile çakışmasın diye GET'te parametreli uç yok.
  @Get("arkadaslar/ara")
  ara(@Req() req: any, @Query("q") q?: string) {
    return this.arkadaslar.ara(req.user.userId, q);
  }

  @Post("arkadaslar/istek")
  istekGonder(@Req() req: any, @Body("userId") userId: unknown) {
    return this.arkadaslar.istekGonder(req.user.userId, userId);
  }

  @Post("arkadaslar/istek/:id/kabul")
  async kabulEt(@Req() req: any, @Param("id") id: string) {
    await this.arkadaslar.kabulEt(req.user.userId, id);
    return { ok: true };
  }

  @Post("arkadaslar/istek/:id/reddet")
  async reddet(@Req() req: any, @Param("id") id: string) {
    await this.arkadaslar.reddet(req.user.userId, id);
    return { ok: true };
  }

  @Delete("arkadaslar/istek/:id")
  async iptalEt(@Req() req: any, @Param("id") id: string) {
    await this.arkadaslar.iptalEt(req.user.userId, id);
    return { ok: true };
  }

  @Delete("arkadaslar/:userId")
  async arkadasliktanCik(@Req() req: any, @Param("userId") userId: string) {
    await this.arkadaslar.arkadasliktanCik(req.user.userId, userId);
    return { ok: true };
  }

  @Get("sosyal/profil/:userId")
  profil(@Req() req: any, @Param("userId") userId: string) {
    return this.arkadaslar.profil(req.user.userId, userId);
  }
}
