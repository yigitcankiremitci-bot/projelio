import { Controller, Get, Headers, HttpCode, Logger, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request, Response } from "express";
import { magazaAdresiCoz, webhookImzasiGecerli } from "./shopify-esleme";
import { ShopifyProcessor } from "./shopify.processor";
import { ShopifyService } from "./shopify.service";

/**
 * Shopify'ın oturumsuz geldiği iki adres. JWT YOK:
 *   · /shopify/callback — kimlik imzalı `state` + Shopify'ın sorgu imzası;
 *   · /shopify/webhook  — kimlik ham gövdenin HMAC'i (main.ts rawBody).
 *
 * Gizlilik webhook'ları (customers/data_request, customers/redact,
 * shop/redact) da aynı adrese gelir; Partner panelinde bu adres yazılır.
 */
@Controller("shopify")
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);

  constructor(
    private shopify: ShopifyService,
    private processor: ShopifyProcessor
  ) {}

  /** Yanıt her hâlükârda ön yüze yönlendirme — kullanıcı ham JSON görmesin. */
  @Get("callback")
  async callback(@Query() sorgu: Record<string, unknown>, @Res() res: Response) {
    const state = this.shopify.stateCoz(sorgu.state);
    try {
      const { organizationId, shop } = await this.shopify.baglantiyiTamamla(sorgu);
      return res.redirect(this.shopify.donusAdresi(organizationId, { baglandi: shop }));
    } catch (err) {
      this.logger.error(`Shopify bağlantısı tamamlanamadı: ${(err as Error).message}`);
      return res.redirect(this.shopify.donusAdresi(state?.organizationId, { hata: (err as Error).message }));
    }
  }

  /**
   * İmza geçersizse 401 — Shopify'ın uygulama incelemesi bunu açıkça
   * deniyor. Geçerliyse olay kuyruğa yazılır ve 200 döner; işleme arkada.
   */
  @Post("webhook")
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-shopify-hmac-sha256") imza: string | undefined,
    @Headers("x-shopify-topic") konu: string | undefined,
    @Headers("x-shopify-shop-domain") shopBasligi: string | undefined,
    @Headers("x-shopify-webhook-id") webhookId: string | undefined
  ): Promise<{ ok: true }> {
    const sir = this.shopify.sir;
    if (!sir || !webhookImzasiGecerli(req.rawBody, imza, sir)) {
      this.logger.warn("İmzası geçersiz Shopify webhook'u reddedildi.");
      throw new UnauthorizedException("Geçersiz imza");
    }
    const shopDomain = magazaAdresiCoz(shopBasligi);
    if (!shopDomain || !konu || !webhookId) return { ok: true };

    const yeni = await this.shopify.olayiSakla({ shopDomain, konu, webhookId, govde: req.body });
    if (yeni) void this.processor.tur();
    return { ok: true };
  }
}
