import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { SocialInspirationInput } from "@projelio/shared";
import { AccessService } from "../../common/access/access.service";
import { istemciDili } from "../../common/i18n";
import { BenzerHesapService } from "./benzer-hesap.service";
import { IcerikAnaliziService } from "./icerik-analizi.service";

/**
 * Sosyal Medya > Analiz sekmesinin uçları: kendi gönderilerinin metrikleri,
 * ilham panosu ve Lio'nun analiz/fikir raporları.
 *
 * Yol düzeni SocialMediaController ile aynı: kapsam (organizasyon / iş) yolun
 * başında, tekil kayıt işlemleri kapsamsız — yetki kaydın sahibinden sorulur.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class IcerikAnaliziController {
  constructor(
    private analiz: IcerikAnaliziService,
    private benzerHesap: BenzerHesapService,
    private access: AccessService
  ) {}

  // ============================================================ Kapsam

  @Get("organizations/:organizationId/social-media/analiz")
  async organizationOverview(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Req() req: any
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    return this.analiz.overview({ organizationId, departmentId }, req.user.userId);
  }

  @Get("jobs/:jobId/social-media/analiz")
  async jobOverview(@Param("jobId") jobId: string, @Req() req: any) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    return this.analiz.overview({ jobId }, req.user.userId);
  }

  @Post("organizations/:organizationId/social-inspirations")
  createOrgInspiration(
    @Param("organizationId") organizationId: string,
    @Body() body: SocialInspirationInput,
    @Req() req: any
  ) {
    return this.analiz.ilhamEkle({ organizationId, departmentId: body.departmentId }, body, req.user.userId);
  }

  @Post("jobs/:jobId/social-inspirations")
  createJobInspiration(@Param("jobId") jobId: string, @Body() body: SocialInspirationInput, @Req() req: any) {
    return this.analiz.ilhamEkle({ jobId }, body, req.user.userId);
  }

  /** Lio fikir raporu. Uzun sürebilir (birkaç bin token çıktı). */
  @Post("organizations/:organizationId/social-media/fikirler")
  orgIdeas(
    @Param("organizationId") organizationId: string,
    @Body() body: { departmentId?: string; accountId?: string; istek?: string },
    @Req() req: any
  ) {
    return this.analiz.fikirUret({ organizationId, departmentId: body?.departmentId }, req.user.userId, {
      accountId: typeof body?.accountId === "string" ? body.accountId : undefined,
      istek: typeof body?.istek === "string" ? body.istek : undefined,
      dil: istemciDili(req) === "en" ? "en" : "tr",
    });
  }

  @Post("jobs/:jobId/social-media/fikirler")
  jobIdeas(@Param("jobId") jobId: string, @Body() body: { accountId?: string; istek?: string }, @Req() req: any) {
    return this.analiz.fikirUret({ jobId }, req.user.userId, {
      accountId: typeof body?.accountId === "string" ? body.accountId : undefined,
      istek: typeof body?.istek === "string" ? body.istek : undefined,
      dil: istemciDili(req) === "en" ? "en" : "tr",
    });
  }

  /**
   * "Benzer hesap bul" — Lio açık web'de arar (Instagram taranmaz). Birkaç
   * arama + okuma, bir iki dakika sürebilir.
   */
  @Post("organizations/:organizationId/social-media/benzer-hesaplar")
  orgDiscover(
    @Param("organizationId") organizationId: string,
    @Body() body: { departmentId?: string; accountId?: string; istek?: string },
    @Req() req: any
  ) {
    return this.benzerHesap.bul({ organizationId, departmentId: body?.departmentId }, req.user.userId, {
      accountId: typeof body?.accountId === "string" ? body.accountId : undefined,
      istek: typeof body?.istek === "string" ? body.istek : undefined,
      dil: istemciDili(req) === "en" ? "en" : "tr",
    });
  }

  @Post("jobs/:jobId/social-media/benzer-hesaplar")
  jobDiscover(@Param("jobId") jobId: string, @Body() body: { accountId?: string; istek?: string }, @Req() req: any) {
    return this.benzerHesap.bul({ jobId }, req.user.userId, {
      accountId: typeof body?.accountId === "string" ? body.accountId : undefined,
      istek: typeof body?.istek === "string" ? body.istek : undefined,
      dil: istemciDili(req) === "en" ? "en" : "tr",
    });
  }

  // ============================================================ Tekil kayıtlar

  /** İlerleyiş grafikleri: takipçi + günlük kazanılan izlenme. */
  @Get("organizations/:organizationId/social-media/analiz/ilerleyis")
  async orgProgress(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Query("accountId") accountId: string | undefined,
    @Query("gun") gun: string | undefined,
    @Req() req: any
  ) {
    await this.access.assertCanViewOrganization(organizationId, req.user.userId);
    return this.analiz.ilerleyis({ organizationId, departmentId }, req.user.userId, {
      accountId: accountId || undefined,
      gun: Number(gun) || 30,
    });
  }

  @Get("jobs/:jobId/social-media/analiz/ilerleyis")
  async jobProgress(
    @Param("jobId") jobId: string,
    @Query("accountId") accountId: string | undefined,
    @Query("gun") gun: string | undefined,
    @Req() req: any
  ) {
    await this.access.assertCanViewJob(jobId, req.user.userId);
    return this.analiz.ilerleyis({ jobId }, req.user.userId, { accountId: accountId || undefined, gun: Number(gun) || 30 });
  }

  /** Tek gönderinin metrik geçmişi (büyüme eğrisi). */
  @Get("social-account-media/:id/gecmis")
  mediaHistory(@Param("id") id: string, @Req() req: any) {
    return this.analiz.medyaGecmisi(id, req.user.userId);
  }

  /** "Şimdi güncelle": hesabın gönderilerini ve metriklerini Instagram'dan çeker. */
  @Post("social-accounts/:id/analiz/senkron")
  sync(@Param("id") id: string, @Req() req: any) {
    return this.analiz.senkronla(id, req.user.userId);
  }

  /** "Bu gönderi neden böyle gitti?" — Lio videoyu izler, metriklerle yorumlar. */
  @Post("social-account-media/:id/lio-analiz")
  analyzeMedia(@Param("id") id: string, @Req() req: any) {
    return this.analiz.gonderiyiAnalizEt(id, req.user.userId, istemciDili(req) === "en" ? "en" : "tr");
  }

  @Patch("social-inspirations/:id")
  updateInspiration(@Param("id") id: string, @Body() body: SocialInspirationInput, @Req() req: any) {
    return this.analiz.ilhamGuncelle(id, body, req.user.userId);
  }

  @Delete("social-inspirations/:id")
  deleteInspiration(@Param("id") id: string, @Req() req: any) {
    return this.analiz.ilhamSil(id, req.user.userId);
  }

  @Post("social-inspirations/:id/lio-analiz")
  analyzeInspiration(@Param("id") id: string, @Req() req: any) {
    return this.analiz.ilhamiAnalizEt(id, req.user.userId, istemciDili(req) === "en" ? "en" : "tr");
  }
}
