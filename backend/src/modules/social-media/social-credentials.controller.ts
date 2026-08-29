import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { SocialCredentialsService, type SocialCredentialInput } from "./social-credentials.service";

/**
 * Sosyal hesap giriş bilgilerinin uçları.
 *
 * SocialMediaController'dan ayrı dosyada olmasının sebebi kalabalık değil
 * sınır: bu uçlar bir SIR döndürüyor ve hepsinin yetki kontrolü kaydın
 * kendisinden geçiyor. Aynı dosyada dursalar, "kapsam yolun başında" düzenine
 * uyan sıradan uçlarla karışırlardı.
 *
 * Şifre yalnızca `reveal` ucundan çıkar; listeleme sırsızdır.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class SocialCredentialsController {
  constructor(private credentials: SocialCredentialsService) {}

  /** Hesabın giriş kayıtları — sır içermez, yalnızca "kayıt var" bilgisi. */
  @Get("social-accounts/:accountId/credentials")
  list(@Param("accountId") accountId: string, @Req() req: any) {
    return this.credentials.list(accountId, req.user.userId);
  }

  @Post("social-accounts/:accountId/credentials")
  create(@Param("accountId") accountId: string, @Body() body: SocialCredentialInput, @Req() req: any) {
    return this.credentials.create(accountId, body, req.user.userId);
  }

  @Patch("social-credentials/:id")
  update(@Param("id") id: string, @Body() body: SocialCredentialInput, @Req() req: any) {
    return this.credentials.update(id, body, req.user.userId);
  }

  @Delete("social-credentials/:id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.credentials.remove(id, req.user.userId);
  }

  /**
   * Şifreyi gösterir.
   *
   * GET değil POST: her çağrı bir denetim satırı yazıyor (yan etki) ve GET
   * olsaydı adres tarayıcı geçmişine, ara belleklere, sunucu erişim
   * loglarına düşerdi. `no-store` de aynı sebeple: yanıt hiçbir yerde
   * saklanmasın.
   */
  @Post("social-credentials/:id/reveal")
  @Header("Cache-Control", "no-store")
  reveal(@Param("id") id: string, @Req() req: any) {
    return this.credentials.reveal(id, req.user.userId);
  }

  // ============================================================ İzinler (yalnızca yönetici)

  @Get("social-credentials/:id/grants")
  grants(@Param("id") id: string, @Req() req: any) {
    return this.credentials.grants(id, req.user.userId);
  }

  @Post("social-credentials/:id/grants")
  grant(
    @Param("id") id: string,
    @Body() body: { userId?: string; expiresAt?: string | null },
    @Req() req: any
  ) {
    return this.credentials.grant(id, body.userId ?? "", body.expiresAt ?? null, req.user.userId);
  }

  @Delete("social-credential-grants/:id")
  revokeGrant(@Param("id") id: string, @Req() req: any) {
    return this.credentials.revokeGrant(id, req.user.userId);
  }

  /** Denetim izi: şifreyi kim, ne zaman, hangi hakla gördü. */
  @Get("social-credentials/:id/views")
  views(@Param("id") id: string, @Req() req: any) {
    return this.credentials.views(id, req.user.userId);
  }
}
