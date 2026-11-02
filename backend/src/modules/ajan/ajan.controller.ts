import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AjanService } from "./ajan.service";

/**
 * Ajan MVP: kullanıcı uçları (JWT). Kimlik daima `req.user.userId`; hiçbir uç
 * kullanıcıyı gövdeden almaz. İzin kontrolü (AJAN_EPOSTALARI) serviste.
 */
@Controller("ajan")
@UseGuards(AuthGuard("jwt"))
export class AjanController {
  constructor(private service: AjanService) {}

  /** Robot ve panel bunu yoklar; izinsiz hesapta `izinli: false` döner, hata değil. */
  @Get("durum")
  durum(@Req() req: any) {
    return this.service.durum(req.user.userId);
  }

  @Patch("ayarlar")
  ayarlar(@Body() body: any, @Req() req: any) {
    return this.service.ayarlariGuncelle(req.user.userId, body ?? {});
  }

  @Post("anahtar")
  anahtar(@Req() req: any) {
    return this.service.anahtarUret(req.user.userId);
  }

  @Get("mesajlar")
  mesajlar(@Req() req: any) {
    return this.service.mesajlar(req.user.userId);
  }

  @Post("mesajlar")
  mesajGonder(@Body() body: any, @Req() req: any) {
    return this.service.mesajGonder(req.user.userId, body?.metin);
  }

  @Post("arastir")
  arastir(@Body() body: any, @Req() req: any) {
    return this.service.arastir(req.user.userId, body?.konu);
  }

  @Get("isler")
  isler(@Req() req: any) {
    return this.service.isler(req.user.userId);
  }

  @Delete("isler/:id")
  async isIptal(@Param("id") id: string, @Req() req: any) {
    await this.service.isIptal(req.user.userId, id);
    return { ok: true };
  }

  @Get("raporlar")
  raporlar(@Req() req: any) {
    return this.service.raporlar(req.user.userId);
  }

  @Get("raporlar/:id")
  rapor(@Param("id") id: string, @Req() req: any) {
    return this.service.rapor(req.user.userId, id);
  }

  @Delete("raporlar/:id")
  async raporSil(@Param("id") id: string, @Req() req: any) {
    await this.service.raporSil(req.user.userId, id);
    return { ok: true };
  }

  @Get("bilgiler")
  bilgiler(@Req() req: any) {
    return this.service.bilgiler(req.user.userId);
  }

  @Post("bilgiler")
  ogret(@Body() body: any, @Req() req: any) {
    return this.service.ogret(req.user.userId, body ?? {});
  }

  @Delete("bilgiler/:id")
  async bilgiSil(@Param("id") id: string, @Req() req: any) {
    await this.service.bilgiSil(req.user.userId, id);
    return { ok: true };
  }

  @Get("konular")
  konular(@Req() req: any) {
    return this.service.konular(req.user.userId);
  }

  @Post("konular")
  konuEkle(@Body() body: any, @Req() req: any) {
    return this.service.konuEkle(req.user.userId, body ?? {});
  }

  @Patch("konular/:id")
  konuGuncelle(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.service.konuGuncelle(req.user.userId, id, body ?? {});
  }

  @Delete("konular/:id")
  async konuSil(@Param("id") id: string, @Req() req: any) {
    await this.service.konuSil(req.user.userId, id);
    return { ok: true };
  }

  @Get("oneriler")
  oneriler(@Req() req: any) {
    return this.service.oneriler(req.user.userId);
  }

  @Post("oneriler/:id/onayla")
  async onayla(@Param("id") id: string, @Req() req: any) {
    await this.service.oneriYanitla(req.user.userId, id, true);
    return { ok: true };
  }

  /** Gövdede isteğe bağlı `not`: fikrin neden istenmediği, ajana geri gider. */
  @Post("oneriler/:id/reddet")
  async reddet(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    await this.service.oneriYanitla(req.user.userId, id, false, body?.not);
    return { ok: true };
  }

  @Get("fikirler")
  fikirler(@Req() req: any) {
    return this.service.fikirler(req.user.userId);
  }

  @Post("fikirler/:id/arastir")
  fikriArastir(@Param("id") id: string, @Req() req: any) {
    return this.service.fikriArastir(req.user.userId, id);
  }

  @Get("otomasyonlar")
  otomasyonlar(@Req() req: any) {
    return this.service.otomasyonlar(req.user.userId);
  }

  @Post("otomasyonlar")
  otomasyonEkle(@Body() body: any, @Req() req: any) {
    return this.service.otomasyonEkle(req.user.userId, body ?? {});
  }

  @Patch("otomasyonlar/:id")
  otomasyonGuncelle(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.service.otomasyonGuncelle(req.user.userId, id, body ?? {});
  }

  @Delete("otomasyonlar/:id")
  async otomasyonSil(@Param("id") id: string, @Req() req: any) {
    await this.service.otomasyonSil(req.user.userId, id);
    return { ok: true };
  }

  @Post("otomasyonlar/:id/calistir")
  otomasyonCalistir(@Param("id") id: string, @Req() req: any) {
    return this.service.otomasyonCalistir(req.user.userId, id);
  }
}

/**
 * Mac'teki ajan programının uçları. JWT değil, kişiye özel anahtar
 * (`Authorization: Bearer ajan_...`): kullanıcının oturum jetonunu bir arka
 * plan programına vermek, o programa hesabın TAMAMINI vermek olurdu. Bu anahtar
 * yalnızca aşağıdaki uçları açar.
 */
@Controller("ajan/isci")
export class AjanIsciController {
  constructor(private service: AjanService) {}

  @Post("nabiz")
  async nabiz(@Headers("authorization") yetki: string, @Body() body: any) {
    return this.service.nabiz(await this.service.isciyiBul(yetki), body ?? {});
  }

  @Post("is-al")
  async isAl(@Headers("authorization") yetki: string, @Body() body: any) {
    return { paket: await this.service.isAl(await this.service.isciyiBul(yetki), { yogun: body?.yogun === true }) };
  }

  @Get("bellek")
  async bellek(@Headers("authorization") yetki: string, @Query("q") q: string) {
    return this.service.bellekteAra(await this.service.isciyiBul(yetki), q);
  }

  @Post("isler/:id/bitir")
  async bitir(@Headers("authorization") yetki: string, @Param("id") id: string, @Body() body: any) {
    return this.service.isBitir(await this.service.isciyiBul(yetki), id, body);
  }
}
