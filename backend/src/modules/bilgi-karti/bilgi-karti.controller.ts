import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BilgiKartiService } from "./bilgi-karti.service";

/**
 * Bilgi kartının uçları — İKİ KAPSAM, TEK KONTROLCÜ.
 *
 * `/bilgi-karti/organization/:id` ve `/bilgi-karti/job/:id`. Ayrı ayrı uçlar
 * (`/organizations/:id/bilgi-karti`, `/jobs/:id/bilgi-karti`) yazılsaydı iki
 * kopya yetki çağrısı olurdu ve biri her düzeltmede unutulurdu — bütçe
 * kademelerinde aynı karar verildi (bkz. ButceKademeController).
 *
 * `scopeType` serbest metin değil: kapsamDogrula tanınmayan değeri 404 ile
 * kesiyor.
 */
@Controller("bilgi-karti/:scopeType/:scopeId")
@UseGuards(AuthGuard("jwt"))
export class BilgiKartiController {
  constructor(private bilgiKarti: BilgiKartiService) {}

  /** Kartın TÜM verisi: künye, ek alanlar, belgeler, özet ve yetki. */
  @Get()
  sayfa(@Param("scopeType") scopeType: string, @Param("scopeId") scopeId: string, @Req() req: any) {
    return this.bilgiKarti.sayfa(this.bilgiKarti.kapsamDogrula(scopeType), scopeId, req.user.userId);
  }

  @Patch()
  guncelle(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.bilgiKarti.guncelle(this.bilgiKarti.kapsamDogrula(scopeType), scopeId, body ?? {}, req.user.userId);
  }

  // ------------------------------------------------------------- Ek alanlar

  @Post("fields")
  alanEkle(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.bilgiKarti.alanEkle(this.bilgiKarti.kapsamDogrula(scopeType), scopeId, body ?? {}, req.user.userId);
  }

  @Patch("fields/:fieldId")
  alanGuncelle(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Param("fieldId") fieldId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.bilgiKarti.alanGuncelle(
      this.bilgiKarti.kapsamDogrula(scopeType),
      scopeId,
      fieldId,
      body ?? {},
      req.user.userId
    );
  }

  @Delete("fields/:fieldId")
  alanSil(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Param("fieldId") fieldId: string,
    @Req() req: any
  ) {
    return this.bilgiKarti.alanSil(this.bilgiKarti.kapsamDogrula(scopeType), scopeId, fieldId, req.user.userId);
  }

  // --------------------------------------------------------------- Belgeler

  @Post("documents")
  belgeEkle(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.bilgiKarti.belgeEkle(this.bilgiKarti.kapsamDogrula(scopeType), scopeId, body ?? {}, req.user.userId);
  }

  @Patch("documents/:documentId")
  belgeGuncelle(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Param("documentId") documentId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.bilgiKarti.belgeGuncelle(
      this.bilgiKarti.kapsamDogrula(scopeType),
      scopeId,
      documentId,
      body ?? {},
      req.user.userId
    );
  }

  /** Belgeyi karttan kaldırır; DOSYAYI SİLMEZ (bkz. BilgiKartiService.belgeSil). */
  @Delete("documents/:documentId")
  belgeSil(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Param("documentId") documentId: string,
    @Req() req: any
  ) {
    return this.bilgiKarti.belgeSil(this.bilgiKarti.kapsamDogrula(scopeType), scopeId, documentId, req.user.userId);
  }
}
