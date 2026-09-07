import { Body, Controller, Headers, HttpCode, Logger, Post, Res, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { getWebAppUrl } from "../../common/config/env";
import { BillingService } from "./billing.service";
import { StorePurchasesService } from "./store-purchases.service";
import { abonelikWebhookDogrula, type AbonelikWebhookGovdesi } from "./iyzico-imza";

/**
 * Ödeme sağlayıcılarının çağırdığı uçlar. JWT YOK — kimlik imza ile kanıtlanır
 * (iyzico) ya da karar hiç bildirime dayanmaz (mağazalar: durum API'den sorulur).
 *
 * TARAYICI DÖNÜŞÜ İLE WEBHOOK'U KARIŞTIRMA:
 *   · /billing/iyzico/callback — KULLANICININ TARAYICISI gelir. Buraya elle de
 *     gidilebilir, o yüzden hiçbir şeye "ödendi" demez; token'ı iyzico'ya sorar.
 *   · /billing/iyzico/webhook  — iyzico'nun sunucusu gelir, imzalıdır ve
 *     yenileme/başarısızlık olaylarını taşır.
 */
@Controller("billing")
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private billing: BillingService,
    private store: StorePurchasesService
  ) {}

  /**
   * iyzico ödeme formunun dönüş adresi. Gövde form-encoded gelir: { token }.
   * Sonucu doğrulayıp kullanıcıyı uygulamaya geri yollarız.
   */
  @Post("iyzico/callback")
  async callback(@Body() body: { token?: string }, @Res() res: Response): Promise<void> {
    const hedef = `${getWebAppUrl()}/settings/billing`;
    try {
      const abonelik = await this.billing.checkoutSonucunuIsle(String(body?.token ?? ""));
      // Sonuç ne olursa olsun kullanıcı uygulamaya döner; ekran durumu yeniden
      // sorgular. Hata sayfası göstermek, ödemesi alınmış kullanıcıyı paniğe sokar.
      res.redirect(302, `${hedef}?durum=${abonelik ? "basarili" : "beklemede"}`);
    } catch (error) {
      this.logger.error(`iyzico callback işlenemedi: ${(error as Error).message}`);
      res.redirect(302, `${hedef}?durum=hata`);
    }
  }

  /**
   * iyzico abonelik webhook'u.
   *
   * İmza doğrulanmadan HİÇBİR ŞEY yapılmaz: doğrulanmamış bir gövde, herkesin
   * istediği aboneliği "ödendi" ilan edebilmesi demektir.
   *
   * 200 dönmek önemli: iyzico 2xx alana kadar 15 dakikada bir yeniden gönderiyor.
   * Yinelenen teslimat zaten dedupe_key ile veritabanında kesiliyor.
   */
  @Post("iyzico/webhook")
  @HttpCode(200)
  async iyzicoWebhook(
    @Body() body: AbonelikWebhookGovdesi & Record<string, unknown>,
    @Headers("x-iyz-signature-v3") imza: string | undefined
  ): Promise<{ ok: true }> {
    const secretKey = process.env.IYZICO_SECRET_KEY?.trim() ?? "";
    const merchantId = process.env.IYZICO_MERCHANT_ID?.trim() ?? "";

    // İmza GÖVDENİN TAMAMI üzerinden değil, gövdedeki belirli alanlar üzerinden
    // hesaplanıyor (bkz. iyzico-imza.ts) — bu yüzden ham gövdeye ihtiyaç yok.
    if (!abonelikWebhookDogrula({ merchantId, secretKey, govde: body, imzaBasligi: imza })) {
      this.logger.warn("İmzası geçersiz iyzico webhook'u reddedildi.");
      throw new UnauthorizedException("Geçersiz imza");
    }

    await this.billing.webhookIsle({
      source: "iyzico",
      eventType: String(body.iyziEventType ?? "unknown"),
      providerRef: body.subscriptionReferenceCode ? String(body.subscriptionReferenceCode) : null,
      dedupeKey: String(body.iyziReferenceCode ?? `${body.orderReferenceCode ?? ""}:${body.iyziEventType ?? ""}`),
      payload: body,
      signatureOk: true,
    });
    return { ok: true };
  }

  /** App Store Server Notifications V2. Gövde: { signedPayload }. */
  @Post("apple/notifications")
  @HttpCode(200)
  async appleNotifications(@Body() body: { signedPayload?: string }): Promise<{ ok: true }> {
    await this.store.appleBildirimi(body?.signedPayload);
    return { ok: true };
  }

  /** Google Play RTDN (Pub/Sub push). Gövde: { message: { data, messageId } }. */
  @Post("google/notifications")
  @HttpCode(200)
  async googleNotifications(@Body() body: { message?: { data?: string; messageId?: string } }): Promise<{ ok: true }> {
    await this.store.googleBildirimi(body?.message ?? {});
    return { ok: true };
  }
}
