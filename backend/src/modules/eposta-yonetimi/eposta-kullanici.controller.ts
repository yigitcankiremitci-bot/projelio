import { Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IpucuEpostaProcessor } from "./ipucu-eposta.processor";

/**
 * Kullanıcının kendi ipucu ucu. Yolu bildirim e-postası ayarlarının yanında
 * (`/notifications/email-prefs/...`) çünkü arayüzde orada duruyor; işleyici
 * bu modülde olduğu için controller da burada.
 */
@Controller("notifications")
@UseGuards(AuthGuard("jwt"))
export class EpostaKullaniciController {
  constructor(private ipucuIsleyici: IpucuEpostaProcessor) {}

  /** Sıradaki ipucunu şimdi gönderir; diziyi ilerletmez. */
  @Post("email-prefs/test-tip")
  async testTip(@Req() req: any) {
    const { sent } = await this.ipucuIsleyici.denemeGonder(req.user.userId);
    return { sent };
  }
}
