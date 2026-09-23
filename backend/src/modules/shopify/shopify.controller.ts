import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ShopifyService } from "./shopify.service";

/**
 * Şirket ayarlarındaki "Shopify mağazası" kartının uçları. Hepsi kurucuya
 * özgü (bkz. ShopifyService.sahipOlmali).
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class ShopifyController {
  constructor(private shopify: ShopifyService) {}

  @Get("organizations/:organizationId/shopify")
  ozet(@Param("organizationId") organizationId: string, @Req() req: any) {
    return this.shopify.ozet(organizationId, req.user.userId);
  }

  /** Shopify'ın yetki ekranının adresi; ön yüz tarayıcıyı oraya götürür. */
  @Post("organizations/:organizationId/shopify/baglan")
  baglan(@Param("organizationId") organizationId: string, @Body() body: { magaza?: string }, @Req() req: any) {
    return this.shopify.baglantiAdresi(organizationId, body?.magaza, req.user.userId);
  }

  @Patch("shopify/magazalar/:id")
  guncelle(@Param("id") id: string, @Body() body: { varsayilanSorumluId?: string | null }, @Req() req: any) {
    return this.shopify.sorumluAta(id, body?.varsayilanSorumluId || null, req.user.userId);
  }

  @Delete("shopify/magazalar/:id")
  kaldir(@Param("id") id: string, @Req() req: any) {
    return this.shopify.kaldir(id, req.user.userId);
  }
}
