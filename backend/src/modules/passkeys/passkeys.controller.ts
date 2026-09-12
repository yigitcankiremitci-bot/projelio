import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PasskeysService } from "./passkeys.service";

/**
 * Geçiş anahtarı uçları.
 *
 * Hepsi oturum gerektiriyor: burada bir GİRİŞ yöntemi kurulmuyor, oturumu açık
 * olan kullanıcının cihazı kaydediliyor. Girişte kullanma ayrı bir karar ve
 * ayrı bir uç ister (bugün yok).
 *
 * Seçenek uçları POST: her çağrı sunucuda tek kullanımlık bir meydan okuma
 * satırı YAZIYOR, yani yan etkisi var.
 */
@Controller("passkeys")
@UseGuards(AuthGuard("jwt"))
export class PasskeysController {
  private passkeys: PasskeysService;

  constructor(passkeys: PasskeysService) {
    this.passkeys = passkeys;
  }

  @Get()
  list(@Req() req: any) {
    return this.passkeys.list(req.user.userId);
  }

  @Post("registration-options")
  registrationOptions(@Req() req: any, @Body() body: { password?: string }) {
    return this.passkeys.registrationOptions(req.user.userId, body?.password, req.user);
  }

  @Post("register")
  register(
    @Body() body: { challenge?: string; clientDataJSON?: string; attestationObject?: string; label?: string },
    @Req() req: any
  ) {
    return this.passkeys.register(req.user.userId, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.passkeys.remove(id, req.user.userId);
  }
}
