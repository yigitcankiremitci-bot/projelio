import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { BillingService } from "./billing.service";
import { StorePurchasesService } from "./store-purchases.service";
import { PayTROdemeService } from "./paytr-odeme.service";
import { PayTRAbonelikService } from "./paytr-abonelik.service";
import { IndirimService, indirimOzeti } from "./indirim.service";
import { AiCreditOrdersService } from "../ai-assistant/ai-credit-orders.service";

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
    private store: StorePurchasesService,
    private paytrOdeme: PayTROdemeService,
    private paytrAbonelik: PayTRAbonelikService,
    private indirimler: IndirimService,
    private creditOrders: AiCreditOrdersService
  ) {}

  /**
   * İndirim kodu önizlemesi (ödeme formundaki "Uygula"). Kullanım YAZMAZ;
   * asıl tutar ödeme formu açılırken sunucuda yeniden hesaplanır.
   */
  @Post("indirim-kodu/onizle")
  async indirimOnizle(
    @Body() body: { kod?: string; kapsam?: string; planKey?: string; period?: string; packageKey?: string },
    @Req() req: any
  ) {
    const kod = String(body?.kod ?? "");
    if (body?.kapsam === "lio") {
      const paket = (await this.creditOrders.listPackages()).find((p) => p.key === body.packageKey);
      if (!paket) throw new BadRequestException("Geçersiz bakiye paketi.");
      return indirimOzeti(await this.indirimler.uygula(req.user.userId, kod, { kapsam: "lio" }, paket.priceTry));
    }
    return this.paytrAbonelik.indirimOnizle(req.user.userId, {
      kod,
      planKey: String(body?.planKey ?? ""),
      period: String(body?.period ?? ""),
    });
  }

  /*
   * PayTR abonelik formları. Üçü de yalnızca GİZLİ ALANLARI döner; kart
   * bilgisini müşteri tarayıcıda girer ve form doğrudan PayTR'ye gider.
   * Tutar gövdeden ALINMAZ, sunucu hesaplar. `onay` = "her dönem kayıtlı
   * kartımdan otomatik yenilensin" kutusu; sunucuda da zorunlu.
   */

  @Post("paytr/abonelik")
  paytrAbonelikFormu(
    @Body() body: { planKey: string; period: string; scope?: string; organizationId?: string; onay?: boolean; indirimKodu?: string },
    @Req() req: any
  ) {
    return this.paytrAbonelik.abonelikFormu(req.user.userId, body ?? ({} as any), req.ip ?? "");
  }

  @Post("paytr/abonelik/:id/odeme")
  paytrGecikmisOdeme(@Param("id") id: string, @Body() body: { onay?: boolean }, @Req() req: any) {
    return this.paytrAbonelik.gecikmisOdemeFormu(req.user.userId, id, req.ip ?? "", body?.onay);
  }

  @Post("paytr/abonelik/:id/kart")
  paytrKartDegisim(@Param("id") id: string, @Body() body: { onay?: boolean }, @Req() req: any) {
    return this.paytrAbonelik.kartDegisimFormu(req.user.userId, id, req.ip ?? "", body?.onay);
  }

  /**
   * Lio Bakiyesi siparişi için PayTR ödeme formunu açar.
   *
   * Tutar GÖVDEDEN ALINMAZ: siparişin kendisinden okunur. İstemcinin ilettiği
   * bir tutara güvenmek, ödenecek rakamı tarayıcıdan değiştirilebilir yapardı.
   *
   * Müşteri IP'si PayTR'nin sahtecilik kontrolüne giriyor ve imzaya dahil;
   * Caddy'nin arkasında olduğumuz için gerçek IP req.ip'ten geliyor
   * (main.ts'te "trust proxy" açık).
   */
  @Post("paytr/lio-bakiyesi/:orderId")
  odemeBaslat(@Param("orderId") orderId: string, @Req() req: any) {
    return this.paytrOdeme.bakiyeOdemesiBaslat(req.user.userId, orderId, req.ip ?? "");
  }

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
  storeStatus(@Req() req: any) {
    return this.store.durum(req.user.userId);
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
