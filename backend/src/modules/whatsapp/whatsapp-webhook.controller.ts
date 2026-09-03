import { Controller, Headers, HttpCode, Logger, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { WhatsappWebhookService, type WahaWebhookEnvelope } from "./whatsapp-webhook.service";
import { HMAC_ALGORITHM_HEADER, HMAC_HEADER, verifyWebhookSignature } from "./whatsapp-webhook-signature";

/**
 * WAHA → backend webhook'u. JWT YOK; kimlik HMAC imzasıyla.
 *
 * Ham gövde şart (main.ts rawBody: true). İmza geçersizse 401 ve hiçbir şey
 * yazılmaz. Geçerliyse olay saklanır, hemen 200 dönülür, işleme arkada
 * başlar — WAHA'nın tekrar deneme mantığı bizim işleme süremize takılmasın.
 *
 * Adres yalnızca compose ağından çağrılır (http://backend:3000/...), Caddy'de
 * dışa açık yolu yoktur; HMAC yine de doğrulanır — iç ağ güven sınırı değil.
 */
@Controller("whatsapp/webhook")
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private webhook: WhatsappWebhookService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers(HMAC_HEADER) signature: string | undefined,
    @Headers(HMAC_ALGORITHM_HEADER) algorithm: string | undefined
  ): Promise<{ ok: true; stored: boolean }> {
    const key = process.env.WAHA_WEBHOOK_HMAC?.trim();
    if (!key) throw new UnauthorizedException("Webhook anahtarı tanımlı değil");

    const valid = verifyWebhookSignature({ rawBody: req.rawBody, key, signatureHeader: signature, algorithmHeader: algorithm });
    if (!valid) {
      this.logger.warn("İmzası geçersiz WhatsApp webhook'u reddedildi.");
      throw new UnauthorizedException("Geçersiz imza");
    }

    const stored = await this.webhook.store((req.body ?? {}) as WahaWebhookEnvelope);
    if (stored) void this.webhook.processPending();
    return { ok: true, stored };
  }
}
