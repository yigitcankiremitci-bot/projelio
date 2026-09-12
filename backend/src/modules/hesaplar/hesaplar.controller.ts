import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { HesaplarService, type HesapGirdisi, type HesapKapsami } from "./hesaplar.service";

/**
 * Hesaplar modülünün uçları — hesap listesi ve paylaşımlar.
 *
 * SIR BURADAN ÇIKMAZ: giriş bilgilerinin uçları ayrı bir denetleyicide
 * (hesap-kimlik.controller.ts). Ayrı durmalarının sebebi kalabalık değil
 * sınır: orada her uç bir sır döndürüyor ve hepsi kilitten geçiyor.
 *
 * Kapsam yolun BAŞINDA (şirket/departman ya da iş): modülün hangi kadroya ait
 * olduğu adresten okunuyor ve yetki hep oradan çözülüyor. Aynı desen sosyal
 * medya ve modül kayıtlarında da var.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class HesaplarController {
  private hesaplar: HesaplarService;

  constructor(hesaplar: HesaplarService) {
    this.hesaplar = hesaplar;
  }

  // ------------------------------------------------------------- Şirket kapsamı

  @Get("organizations/:organizationId/service-accounts")
  orgListe(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Req() req: any
  ) {
    return this.hesaplar.liste({ organizationId, departmentId }, req.user.userId);
  }

  @Post("organizations/:organizationId/service-accounts")
  orgEkle(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Body() body: HesapGirdisi,
    @Req() req: any
  ) {
    return this.hesaplar.ekle({ organizationId, departmentId }, body, req.user.userId);
  }

  @Get("organizations/:organizationId/service-account-grants")
  orgPaylasimlar(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Query("accountId") accountId: string | undefined,
    @Req() req: any
  ) {
    return this.hesaplar.paylasimlar({ organizationId, departmentId }, accountId, req.user.userId);
  }

  @Post("organizations/:organizationId/service-account-grants")
  orgPaylas(
    @Param("organizationId") organizationId: string,
    @Query("departmentId") departmentId: string | undefined,
    @Body() body: { userId?: string; accountId?: string | null; expiresAt?: string | null },
    @Req() req: any
  ) {
    return this.hesaplar.paylas({ organizationId, departmentId }, body, req.user.userId);
  }

  // ------------------------------------------------------------- İş kapsamı

  @Get("jobs/:jobId/service-accounts")
  isListe(@Param("jobId") jobId: string, @Req() req: any) {
    return this.hesaplar.liste({ jobId }, req.user.userId);
  }

  @Post("jobs/:jobId/service-accounts")
  isEkle(@Param("jobId") jobId: string, @Body() body: HesapGirdisi, @Req() req: any) {
    return this.hesaplar.ekle({ jobId }, body, req.user.userId);
  }

  @Get("jobs/:jobId/service-account-grants")
  isPaylasimlar(
    @Param("jobId") jobId: string,
    @Query("accountId") accountId: string | undefined,
    @Req() req: any
  ) {
    return this.hesaplar.paylasimlar({ jobId }, accountId, req.user.userId);
  }

  @Post("jobs/:jobId/service-account-grants")
  isPaylas(
    @Param("jobId") jobId: string,
    @Body() body: { userId?: string; accountId?: string | null; expiresAt?: string | null },
    @Req() req: any
  ) {
    return this.hesaplar.paylas({ jobId }, body, req.user.userId);
  }

  // ------------------------------------------------------------- Kayıt başına
  //
  // Kapsam yolda YOK: kaydın kendisi hangi kapsama ait olduğunu taşıyor ve
  // yetki oradan çözülüyor. Kapsamı istemciden almak, aynı kuralın ikinci bir
  // kopyası ve uyuşmazlık ihtimali demekti.

  @Patch("service-accounts/:id")
  guncelle(@Param("id") id: string, @Body() body: HesapGirdisi, @Req() req: any) {
    return this.hesaplar.guncelle(id, body, req.user.userId);
  }

  @Delete("service-accounts/:id")
  sil(@Param("id") id: string, @Req() req: any) {
    return this.hesaplar.sil(id, req.user.userId);
  }

  @Delete("service-account-grants/:id")
  paylasimiKaldir(@Param("id") id: string, @Req() req: any) {
    return this.hesaplar.paylasimiKaldir(id, req.user.userId);
  }
}

/** Kapsamı iki uç ailesinde de aynı biçime getiren yardımcı tip. */
export type { HesapKapsami };
