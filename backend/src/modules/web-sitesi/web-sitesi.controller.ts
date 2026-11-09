import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { WebSitesiB2bService } from "./web-sitesi-b2b.service";
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
    private processor: WebSitesiProcessor,
    private b2b: WebSitesiB2bService
  ) {}

  /** Anahtarı denemek için; site kurulumunun ilk adımı. */
  @Get("ping")
  async ping(@Headers("authorization") yetki: string) {
    const site = await this.service.siteyiBul(yetki);
    return { ok: true, connection_id: site.baglantiId };
  }

  /** `?customer_id=` verilirse müşterinin iskontolu fiyatları da eklenir. */
  @Get("products")
  async urunler(@Headers("authorization") yetki: string, @Query() sorgu: Record<string, string>) {
    return this.service.urunler(await this.service.siteyiBul(yetki), sorgu ?? {});
  }

  @Get("products/:ref")
  async urun(@Headers("authorization") yetki: string, @Param("ref") ref: string, @Query("customer_id") musteriId?: string) {
    return this.service.urun(await this.service.siteyiBul(yetki), ref, musteriId);
  }

  @Get("customers/:id")
  async musteri(@Headers("authorization") yetki: string, @Param("id") id: string) {
    return this.b2b.musteri(await this.service.siteyiBul(yetki), id);
  }

  @Get("customers/:id/orders")
  async musterininSiparisleri(@Headers("authorization") yetki: string, @Param("id") id: string) {
    return this.b2b.musterininSiparisleri(await this.service.siteyiBul(yetki), id);
  }

  @Get("portal-users")
  async portalKullanicilari(@Headers("authorization") yetki: string, @Query("customer_id") musteriId?: string) {
    return this.b2b.portalKullanicilari(await this.service.siteyiBul(yetki), musteriId);
  }

  /** Yeni sipariş 201, aynı referansla tekrar 200 + mevcut sipariş. */
  @Post("orders")
  async siparis(@Headers("authorization") yetki: string, @Body() body: unknown, @Res({ passthrough: true }) res: any) {
    const sonuc = await this.b2b.siparisVer(await this.service.siteyiBul(yetki), body);
    res.status(sonuc.created ? 201 : 200);
    return sonuc;
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

/**
 * Müşteri kartının "Web portalı" bölümü (JWT). Yetki müşteri kartıyla aynı:
 * okuyabilen görür, kartı düzenleyebilen hesap açar/kapatır.
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class PortalKullanicilariController {
  constructor(private b2b: WebSitesiB2bService) {}

  @Get("party/:partyId/web-portal")
  ozet(@Param("partyId") partyId: string, @Req() req: any) {
    return this.b2b.ozet(partyId, req.user.userId);
  }

  @Post("party/:partyId/web-portal/kullanicilar")
  ac(@Param("partyId") partyId: string, @Body() body: any, @Req() req: any) {
    return this.b2b.kullaniciAc(partyId, req.user.userId, body ?? {});
  }

  @Patch("web-portal/kullanicilar/:id")
  guncelle(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.b2b.kullaniciGuncelle(id, req.user.userId, body ?? {});
  }
}
