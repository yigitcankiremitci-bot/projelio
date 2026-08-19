import { Controller, Get, Logger, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { InstagramOAuthService } from "./instagram-oauth.service";
import { InstagramService } from "./instagram.service";

/**
 * Meta'nın geri dönüş adresi.
 *
 * AYRI CONTROLLER, çünkü SocialMediaController'ın tamamı JWT arkasında;
 * Instagram buraya kullanıcının oturum başlığı olmadan geliyor. Güvenlik
 * `state` ile sağlanıyor: imzalı, 10 dakika ömürlü ve hangi kullanıcının hangi
 * kapsam için başlattığını taşıyor (bkz. InstagramOAuthService.signState).
 *
 * Yanıt her hâlükârda ön yüze YÖNLENDİRMEDİR — kullanıcı bu adreste ham JSON
 * görmemeli.
 */
@Controller()
export class InstagramController {
  private readonly logger = new Logger(InstagramController.name);

  constructor(
    private instagram: InstagramService,
    private oauth: InstagramOAuthService
  ) {}

  @Get("social/instagram/callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Query("error_description") errorDescription: string,
    @Res() res: Response
  ) {
    // Kullanıcı izni reddettiyse Meta kod yerine hata döner; bu bir arıza
    // değil, bir karar. Sessizce modüle geri götürürüz.
    if (error) {
      return res.redirect(this.returnUrl(state, { error: errorDescription || error }));
    }
    if (!code || !state) {
      return res.redirect(this.returnUrl(state, { error: "Instagram'dan beklenen yanıt gelmedi." }));
    }

    try {
      const result = await this.instagram.completeConnect(state, code);
      return res.redirect(this.returnUrl(state, { connected: result.username }));
    } catch (err) {
      this.logger.error(`Instagram bağlantısı tamamlanamadı: ${(err as Error).message}`);
      return res.redirect(this.returnUrl(state, { error: (err as Error).message }));
    }
  }

  /**
   * Kullanıcının döneceği ön yüz adresi.
   *
   * `next` state içinde taşınıyor; state çözülemezse (süresi dolmuş, kurcalanmış)
   * kullanıcıyı kaybetmeyelim diye anasayfaya düşeriz.
   */
  private returnUrl(state: string, params: { connected?: string; error?: string }): string {
    let next = "/";
    try {
      next = this.oauth.verifyState(state).next || "/";
    } catch {
      // yoksay: aşağıdaki varsayılan geçerli
    }

    const url = new URL(`${this.oauth.webAppUrl}${next.startsWith("/") ? next : `/${next}`}`);
    if (params.connected) url.searchParams.set("instagram", `connected:${params.connected}`);
    if (params.error) url.searchParams.set("instagram", `error:${params.error}`);
    return url.toString();
  }
}
