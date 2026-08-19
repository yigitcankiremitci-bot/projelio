import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AccessService } from "../../common/access/access.service";
import { InstagramService } from "./instagram.service";
import { SocialMediaService } from "./social-media.service";
import type { SocialAccountInput, SocialPostInput, SocialScope } from "./social-media.service";
import { SocialPublishService } from "./social-publish.service";

/**
 * Sosyal Medya modülünün uçları.
 *
 * Yol düzeni module-records ile aynı: kapsam (organizasyon / iş) yolun
 * başında, tekil kayıt işlemleri kapsamsız — kaydın sahibi zaten kaydın
 * kendisinden okunuyor ve yetki oradan soruluyor.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class SocialMediaController {
  constructor(
    private social: SocialMediaService,
    private instagram: InstagramService,
    private publish: SocialPublishService,
    private access: AccessService
  ) {}

  // ============================================================ Organizasyon kapsamı

  @Get("organizations/:organizationId/social-media")
  async organizationOverview(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Req() req: any
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    return this.social.overview({ organizationId, departmentId }, req.user.userId);
  }

  @Post("organizations/:organizationId/social-accounts")
  createOrgAccount(
    @Param("organizationId") organizationId: string,
    @Body() body: SocialAccountInput,
    @Req() req: any
  ) {
    return this.social.createAccount(orgScope(organizationId, body.departmentId), body, req.user.userId);
  }

  @Post("organizations/:organizationId/social-posts")
  createOrgPost(
    @Param("organizationId") organizationId: string,
    @Body() body: SocialPostInput,
    @Req() req: any
  ) {
    return this.social.createPost(orgScope(organizationId, body.departmentId), body, req.user.userId);
  }

  // ============================================================ İş kapsamı (serbest çalışan)

  @Get("jobs/:jobId/social-media")
  async jobOverview(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    return this.social.overview({ jobId }, req.user.userId);
  }

  @Post("jobs/:jobId/social-accounts")
  createJobAccount(@Param("jobId") jobId: string, @Body() body: SocialAccountInput, @Req() req: any) {
    return this.social.createAccount({ jobId }, body, req.user.userId);
  }

  @Post("jobs/:jobId/social-posts")
  createJobPost(@Param("jobId") jobId: string, @Body() body: SocialPostInput, @Req() req: any) {
    return this.social.createPost({ jobId }, body, req.user.userId);
  }

  // ============================================================ Tekil kayıtlar

  @Patch("social-accounts/:id")
  updateAccount(@Param("id") id: string, @Body() body: SocialAccountInput, @Req() req: any) {
    return this.social.updateAccount(id, body, req.user.userId);
  }

  // Silme değil arşivleme: geçmiş gönderilerin hangi hesapta yayımlandığı
  // bilgisi kaybolmasın (bkz. SocialMediaService.archiveAccount).
  @Delete("social-accounts/:id")
  archiveAccount(@Param("id") id: string, @Req() req: any) {
    return this.social.archiveAccount(id, req.user.userId);
  }

  @Get("social-posts/:id")
  findPost(@Param("id") id: string, @Req() req: any) {
    return this.social.findPost(id, req.user.userId);
  }

  @Patch("social-posts/:id")
  updatePost(@Param("id") id: string, @Body() body: SocialPostInput, @Req() req: any) {
    return this.social.updatePost(id, body, req.user.userId);
  }

  /** Takvimde sürükleme: yalnızca tarih değişir, formun tamamı gönderilmez. */
  @Patch("social-posts/:id/schedule")
  reschedule(@Param("id") id: string, @Body("scheduledAt") scheduledAt: string | null, @Req() req: any) {
    return this.social.reschedule(id, scheduledAt ?? null, req.user.userId);
  }

  @Delete("social-posts/:id")
  archivePost(@Param("id") id: string, @Req() req: any) {
    return this.social.archivePost(id, req.user.userId);
  }

  @Patch("social-posts/:id/restore")
  restorePost(@Param("id") id: string, @Req() req: any) {
    return this.social.restorePost(id, req.user.userId);
  }

  @Post("social-posts/:id/media")
  attachMedia(
    @Param("id") id: string,
    @Body() body: { fileId?: string; altText?: string },
    @Req() req: any
  ) {
    return this.social.attachMedia(id, body, req.user.userId);
  }

  @Delete("social-media/:mediaId")
  detachMedia(@Param("mediaId") mediaId: string, @Req() req: any) {
    return this.social.detachMedia(mediaId, req.user.userId);
  }

  // ============================================================ Instagram bağlantısı

  /**
   * Entegrasyon bu kurulumda açık mı.
   *
   * Arayüz buna bakıp "Instagram'ı bağla" düğmesini hiç göstermiyor: ortam
   * değişkeni tanımlı değilken düğmeyi gösterip hata vermek, kullanıcıya
   * kendi hatasıymış gibi hissettiriyordu.
   */
  @Get("social-media/instagram/status")
  instagramStatus() {
    return { configured: this.instagram.isConfigured() };
  }

  @Get("organizations/:organizationId/social-media/instagram/connect-url")
  connectOrgInstagram(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Query("next") next: string | undefined,
    @Req() req: any
  ) {
    return this.instagram.buildConnectUrl({ organizationId, departmentId }, req.user.userId, next);
  }

  @Get("jobs/:jobId/social-media/instagram/connect-url")
  connectJobInstagram(@Param("jobId") jobId: string, @Query("next") next: string | undefined, @Req() req: any) {
    return this.instagram.buildConnectUrl({ jobId }, req.user.userId, next);
  }

  /** Bağlantıyı koparır; hesap kaydı ve geçmişi kalır (elle yönetime döner). */
  @Post("social-accounts/:id/disconnect")
  disconnectInstagram(@Param("id") id: string, @Req() req: any) {
    return this.instagram.disconnect(id, req.user.userId);
  }

  // ============================================================ Yayın

  /** "Şimdi paylaş": gönderinin yayımlanmamış bütün kanalları denenir. */
  @Post("social-posts/:id/publish")
  publishPost(@Param("id") id: string, @Req() req: any) {
    return this.publish.publishPostNow(id, req.user.userId);
  }

  /** Tek kanalı yeniden dener (hata sonrası). */
  @Post("social-post-targets/:id/publish")
  publishTarget(@Param("id") id: string, @Req() req: any) {
    return this.publish.publishTargetNow(id, req.user.userId);
  }
}

function orgScope(organizationId: string, departmentId?: string): SocialScope {
  return { organizationId, departmentId };
}
