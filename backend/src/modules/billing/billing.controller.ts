import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BillingService } from "./billing.service";
import { StorePurchasesService } from "./store-purchases.service";

/**
 * Abonelik ekranının uçları.
 *
 * Webhook'lar ve sağlayıcı dönüşleri BURADA DEĞİL (billing-webhook.controller.ts):
 * onlar JWT taşımaz, kimliklerini imzayla kanıtlar. İkisini aynı controller'da
 * toplamak, sınıf düzeyindeki AuthGuard'ı tek bir uç için delmek demekti.
 */
@Controller("billing")
@UseGuards(AuthGuard("jwt"))
export class BillingController {
  constructor(
    private billing: BillingService,
    private store: StorePurchasesService
  ) {}

  /** Paket listesi + mevcut abonelik + sağlayıcı durumu. */
  @Get("plans")
  plans(@Req() req: any) {
    return this.billing.vitrin(req.user.userId);
  }

  @Get("subscription")
  async subscription(@Req() req: any) {
    const { plan, subscription } = await this.billing.aktifPlan(req.user.userId);
    return { plan: plan.key, planName: plan.name, monthlyCredits: plan.monthlyCredits, subscription };
  }

  /**
   * Ödeme formunu başlatır. Gövde: { planKey, period, scope?, organizationId? }
   * Fiyat ve kredi GÖVDEDEN ALINMAZ — sunucudaki katalogdan okunur.
   */
  @Post("checkout")
  checkout(
    @Body() body: { planKey: string; period: string; scope?: string; organizationId?: string },
    @Req() req: any
  ) {
    return this.billing.checkoutBaslat(req.user.userId, body);
  }

  /**
   * Ödeme sonucunu sağlayıcıdan doğrular.
   *
   * Tarayıcı callback'ten dönerken çağrılır. Kullanıcıyı kimlik olarak
   * KULLANMIYORUZ: aboneliğin kime yazılacağı iyzico'ya gönderilen
   * conversationId'den çözülür, yoksa başkasının jetonuyla kendine abonelik
   * yazdırmak mümkün olurdu.
   */
  @Post("checkout/confirm")
  confirm(@Body() body: { token: string }) {
    return this.billing.checkoutSonucunuIsle(body?.token);
  }

  @Post("subscription/:id/cancel")
  cancel(@Param("id") id: string, @Req() req: any) {
    return this.billing.iptalEt(req.user.userId, id);
  }

  @Post("subscription/:id/card-update")
  cardUpdate(@Param("id") id: string, @Req() req: any) {
    return this.billing.kartGuncellemeFormu(req.user.userId, id);
  }

  // ------------------------------------------------------------- Mağazalar

  /** Mobil istemcinin hangi mağaza akışını açabileceğini öğrenmesi için. */
  @Get("store/status")
  storeStatus() {
    return this.store.durum();
  }

  /** iOS istemcisi satın almayı bitirince çağırır; doğrulama Apple'a sorularak yapılır. */
  @Post("store/apple")
  apple(@Body() body: { originalTransactionId: string }, @Req() req: any) {
    return this.store.appleDogrula(req.user.userId, body?.originalTransactionId);
  }

  /** Android istemcisi satın almayı bitirince çağırır; doğrulama Google'a sorularak yapılır. */
  @Post("store/google")
  google(@Body() body: { purchaseToken: string }, @Req() req: any) {
    return this.store.googleDogrula(req.user.userId, body?.purchaseToken);
  }
}
