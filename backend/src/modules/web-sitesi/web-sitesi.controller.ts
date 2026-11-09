import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { WebSitesiProcessor } from "./web-sitesi.processor";
import { WebSitesiService } from "./web-sitesi.service";

/**
 * Şirket ayarlarındaki "Web sitesi" kartının uçları (JWT). Yetki serviste:
 * izin listesi (WEB_SITESI_EPOSTALARI) + şirketi yönetme hakkı.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class WebSitesiController {
  constructor(private service: WebSitesiService) {}

  @Get("organizations/:organizationId/web-sitesi")
  ozet(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.service.ozet(organizationId, req.user.userId);
  }

  /** Anahtar ve imza sırrı yalnızca bu yanıtta düz görünür. */
  @Post("organizations/:organizationId/web-sitesi")
  olustur(@Param("organizationId") organizationId: string, @Body() body: any, @Req() req: any) {
    return this.service.olustur(organizationId, req.user.userId, body);
  }

  @Patch("web-sitesi/baglantilar/:id")
  guncelle(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.service.guncelle(id, req.user.userId, body);
  }

  @Post("web-sitesi/baglantilar/:id/anahtar")
  anahtarYenile(@Param("id") id: string, @Req() req: any) {
    return this.service.anahtarYenile(id, req.user.userId);
  }

  @Get("web-sitesi/baglantilar/:id/sir")
  sirGoster(@Param("id") id: string, @Req() req: any) {
    return this.service.sirGoster(id, req.user.userId);
  }

  @Post("web-sitesi/baglantilar/:id/dene")
  dene(@Param("id") id: string, @Req() req: any) {
    return this.service.dene(id, req.user.userId);
  }

  @Post("web-sitesi/baglantilar/:id/yeniden-gonder")
  yenidenGonder(@Param("id") id: string, @Req() req: any) {
    return this.service.yenidenGonder(id, req.user.userId);
  }

  @Delete("web-sitesi/baglantilar/:id")
  kaldir(@Param("id") id: string, @Req() req: any) {
    return this.service.kaldir(id, req.user.userId);
  }
}

/**
 * Şirketin sitesinin çağırdığı uçlar. JWT YOK: kimlik bağlantıya özel anahtar
 * (`Authorization: Bearer psite_...`). Sitenin SUNUCUSUNDAN çağrılmalı —
 * anahtar tarayıcıya konursa herkes stok düşürebilir (belgede yazılı).
 * Yanıtlar ve hata metinleri İngilizce: okuyan, sitenin geliştiricisi.
 */
@Controller("v1/site")
export class SiteApiController {
  constructor(
    private service: WebSitesiService,
    private processor: WebSitesiProcessor
  ) {}

  /** Anahtarı denemek için; site kurulumunun ilk adımı. */
  @Get("ping")
  async ping(@Headers("authorization") yetki: string) {
    const site = await this.service.siteyiBul(yetki);
    return { ok: true, connection_id: site.baglantiId };
  }

  @Get("products")
  async urunler(@Headers("authorization") yetki: string, @Query() sorgu: Record<string, string>) {
    return this.service.urunler(await this.service.siteyiBul(yetki), sorgu ?? {});
  }

  @Get("products/:ref")
  async urun(@Headers("authorization") yetki: string, @Param("ref") ref: string) {
    return this.service.urun(await this.service.siteyiBul(yetki), ref);
  }

  @Post("stock-movements")
  @HttpCode(200)
  async stok(@Headers("authorization") yetki: string, @Body() body: unknown) {
    const sonuc = await this.service.stokHareketi(await this.service.siteyiBul(yetki), body);
    // Stok değişti → tetikleyici kuyruğa yazdı; dakikalık turu beklemeden gönder.
    this.processor.tetikle();
    return sonuc;
  }
}
