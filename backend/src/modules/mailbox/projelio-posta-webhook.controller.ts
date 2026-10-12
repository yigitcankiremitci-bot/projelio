import {
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { svixImzasiGecerli } from "./projelio-posta";
import { ProjelioPostaService } from "./projelio-posta.service";

/**
 * Resend'in gelen-posta webhook'u — @projelio.app kutularına posta buradan düşer.
 *
 * JWT YOK; kimlik ham gövdenin Svix imzası (main.ts rawBody). Sır
 * `RESEND_INBOUND_WEBHOOK_SECRET` (Resend > Webhooks > uç noktanın "Signing
 * secret"ı, whsec_ ile başlar). Tanımsızsa HER istek reddedilir: imzasız bir
 * uç, herkesin herhangi bir kutuya sahte posta yazması demekti.
 *
 * İşleme EŞZAMANLI: hata olursa 500 dönüyoruz ki Resend yeniden denesin.
 * Tekrar zararsız, ileti (kutu, resend_id) tekil indeksine çarpar.
 */
@Controller("mail/inbound")
export class ProjelioPostaWebhookController {
  private readonly logger = new Logger(ProjelioPostaWebhookController.name);

  constructor(private posta: ProjelioPostaService) {}

  @Post("resend")
  @HttpCode(200)
  async resend(
    @Req() req: RawBodyRequest<Request>,
    @Headers("svix-id") id: string | undefined,
    @Headers("svix-timestamp") zaman: string | undefined,
    @Headers("svix-signature") imza: string | undefined
  ): Promise<{ ok: true }> {
    const sir = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() ?? "";
    if (!svixImzasiGecerli({ govde: req.rawBody, id, zaman, imza, sir })) {
      this.logger.warn(sir ? "İmzası geçersiz gelen-posta webhook'u reddedildi." : "RESEND_INBOUND_WEBHOOK_SECRET tanımlı değil; gelen posta reddedildi.");
      throw new UnauthorizedException("Geçersiz imza");
    }

    const olay = req.body as { type?: string; data?: { email_id?: string } };
    // Aynı uca başka olaylar da bağlanmış olabilir (email.delivered vb.); yok sayılır.
    if (olay?.type !== "email.received" || !olay.data?.email_id) return { ok: true };

    try {
      const { kutular } = await this.posta.gelenIsle(olay.data.email_id);
      if (kutular) this.logger.log(`Gelen posta ${kutular} kutuya yazıldı (resend ${olay.data.email_id}).`);
    } catch (err) {
      this.logger.error(`Gelen posta işlenemedi (resend ${olay.data.email_id}): ${(err as Error).message}`);
      throw new InternalServerErrorException("Gelen posta işlenemedi");
    }
    return { ok: true };
  }
}
