import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { AccessService } from "../../common/access/access.service";
import { RakipTakibiService } from "./rakip-takibi.service";
import type { SocialScope } from "./social-media.service";

/**
 * Sosyal Medya > Analiz > Rakipler uçları.
 *
 * Yol düzeni modülün geri kalanıyla aynı: kapsam (organizasyon / iş) yolun
 * başında, tekil kayıtlar kapsamsız (yetki kaydın sahibinden sorulur).
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class RakipTakibiController {
  constructor(
    private rakip: RakipTakibiService,
    private access: AccessService
  ) {}

  @Get("organizations/:organizationId/social-media/rakipler")
  async orgOverview(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Req() req: any
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    return this.rakip.overview({ organizationId, departmentId }, req.user.userId);
  }

  @Get("jobs/:jobId/social-media/rakipler")
  async jobOverview(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    return this.rakip.overview({ jobId }, req.user.userId);
  }

  @Get("organizations/:organizationId/social-media/facebook/connect-url")
  orgConnect(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Query("next") next: string | undefined,
    @Req() req: any
  ) {
    return this.rakip.connectUrl({ organizationId, departmentId }, req.user.userId, next);
  }

  @Get("jobs/:jobId/social-media/facebook/connect-url")
  jobConnect(@Param("jobId") jobId: string, @Query("next") next: string | undefined, @Req() req: any) {
    return this.rakip.connectUrl({ jobId }, req.user.userId, next);
  }

  @Delete("organizations/:organizationId/social-media/facebook")
  orgDisconnect(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Req() req: any
  ) {
    return this.rakip.baglantiyiKaldir({ organizationId, departmentId }, req.user.userId);
  }

  @Delete("jobs/:jobId/social-media/facebook")
  jobDisconnect(@Param("jobId") jobId: string, @Req() req: any) {
    return this.rakip.baglantiyiKaldir({ jobId }, req.user.userId);
  }

  /** "Şimdi güncelle": takipteki rakipler (10 dakikadan sık değil). */
  @Post("organizations/:organizationId/social-media/rakipler/senkron")
  orgSync(@Param("organizationId") organizationId: string, @Body() body: { departmentId?: string }, @Req() req: any) {
    return this.rakip.rakipleriGuncelle(orgScope(organizationId, body?.departmentId), req.user.userId);
  }

  @Post("jobs/:jobId/social-media/rakipler/senkron")
  jobSync(@Param("jobId") jobId: string, @Req() req: any) {
    return this.rakip.rakipleriGuncelle({ jobId }, req.user.userId);
  }

  @Post("organizations/:organizationId/social-media/hashtagler")
  orgHashtag(
    @Param("organizationId") organizationId: string,
    @Body() body: { departmentId?: string; hashtag?: string },
    @Req() req: any
  ) {
    return this.rakip.hashtagEkle(orgScope(organizationId, body?.departmentId), String(body?.hashtag ?? ""), req.user.userId);
  }

  @Post("jobs/:jobId/social-media/hashtagler")
  jobHashtag(@Param("jobId") jobId: string, @Body() body: { hashtag?: string }, @Req() req: any) {
    return this.rakip.hashtagEkle({ jobId }, String(body?.hashtag ?? ""), req.user.userId);
  }

  /** İlham kaydını rakip takibine al / çıkar. */
  @Patch("social-inspirations/:id/takip")
  setTracking(@Param("id") id: string, @Body("takip") takip: boolean, @Req() req: any) {
    return this.rakip.takipAyarla(id, takip === true, req.user.userId);
  }

  @Patch("social-hashtag-tracks/:id")
  setHashtag(@Param("id") id: string, @Body("aktif") aktif: boolean, @Req() req: any) {
    return this.rakip.hashtagAyarla(id, aktif === true, req.user.userId);
  }

  @Delete("social-hashtag-tracks/:id")
  deleteHashtag(@Param("id") id: string, @Req() req: any) {
    return this.rakip.hashtagSil(id, req.user.userId);
  }
}

/**
 * Meta'nın Facebook Login dönüş adresi. AYRI controller: kullanıcının oturum
 * başlığı olmadan geliyor; güvenlik imzalı `state` ile (InstagramController
 * ile aynı desen). Yanıt her hâlükârda ön yüze YÖNLENDİRMEDİR.
 */
@Controller()
export class FacebookCallbackController {
  private readonly logger = new Logger(FacebookCallbackController.name);

  constructor(private rakip: RakipTakibiService) {}

  @Get("social/facebook/callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Query("error_description") errorDescription: string,
    @Res() res: Response
  ) {
    if (error) return res.redirect(this.donus(state, { hata: errorDescription || error }));
    if (!code || !state) return res.redirect(this.donus(state, { hata: "Facebook'tan beklenen yanıt gelmedi." }));
    try {
      const sonuc = await this.rakip.baglantiyiTamamla(state, code);
      return res.redirect(this.donus(state, { bagli: sonuc.igUsername ?? "ok" }));
    } catch (err) {
      this.logger.error(`Facebook bağlantısı tamamlanamadı: ${(err as Error).message}`);
      return res.redirect(this.donus(state, { hata: (err as Error).message }));
    }
  }

  private donus(state: string, p: { bagli?: string; hata?: string }): string {
    let next = "/";
    try {
      next = this.rakip.stateCoz(state).next || "/";
    } catch {
      // yoksay: varsayılan geçerli
    }
    const url = new URL(`${this.rakip.webAppUrl()}${next.startsWith("/") ? next : `/${next}`}`);
    if (p.bagli) url.searchParams.set("facebook", `connected:${p.bagli}`);
    if (p.hata) url.searchParams.set("facebook", `error:${p.hata}`);
    return url.toString();
  }
}

function orgScope(organizationId: string, departmentId?: string): SocialScope {
  return { organizationId, departmentId };
}
