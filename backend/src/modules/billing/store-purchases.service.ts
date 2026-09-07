import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AppleStoreClient } from "./apple-store.client";
import { GooglePlayClient } from "./google-play.client";
import { BillingService, type Abonelik } from "./billing.service";
import { BillingSettingsService, type OdemeSaglayici } from "./billing-settings.service";
import type { BillingPeriod, PlanKey } from "./billing.plans";

/**
 * Mağaza (App Store / Google Play) satın almalarının ortak kapısı.
 *
 * MAĞAZA ABONELİĞİ NEDEN BİZDEN GEÇMEK ZORUNDA: mağaza parayı alır ama bizim
 * tarafta hak vermez. İstemci satın almayı bitirince buraya haber verir, biz
 * mağazaya SORARAK doğrularız ve ancak ondan sonra abonelik satırını yazarız.
 * Doğrulanmış satın alma, iyzico'dan gelen abonelikle AYNI gövdeye bağlanır
 * (BillingService.aboneligiKaydet) — kredi ve hak mantığı tek yerde kalsın.
 *
 * BUGÜN KAPALI. Anahtarlar tanımlı olmadığı için isConfigured() false döner ve
 * uçlar 503 verir. Mobil istemci hazır olduğunda tek yapılacak, ortam
 * değişkenlerini tanımlamak ve mağaza ürün kimliklerini billing_plan_refs'e
 * yazmaktır — kod tarafında değişiklik gerekmiyor.
 *
 * İPTAL/İADE BİZDE DEĞİL: mağaza aboneliğini yalnızca mağaza iptal eder
 * (bkz. BillingService.iptalEt). Buradan gelen tek şey durum bilgisidir.
 */
@Injectable()
export class StorePurchasesService {
  private readonly logger = new Logger(StorePurchasesService.name);

  private readonly apple: AppleStoreClient;
  private readonly play: GooglePlayClient;
  private readonly billing: BillingService;
  private readonly settings: BillingSettingsService;

  constructor(
    @Inject(AppleStoreClient) apple: AppleStoreClient,
    @Inject(GooglePlayClient) play: GooglePlayClient,
    @Inject(BillingService) billing: BillingService,
    @Inject(BillingSettingsService) settings: BillingSettingsService
  ) {
    this.apple = apple;
    this.play = play;
    this.billing = billing;
    this.settings = settings;
  }

  durum(): { appStore: boolean; playStore: boolean } {
    return { appStore: this.apple.isConfigured(), playStore: this.play.isConfigured() };
  }

  /**
   * App Store satın almasını doğrular ve aboneliği yazar.
   * İstemciden yalnızca originalTransactionId alınır; gerçeği Apple söyler.
   */
  async appleDogrula(userId: string, originalTransactionId: string): Promise<Abonelik> {
    if (!originalTransactionId?.trim()) throw new BadRequestException("İşlem kimliği eksik.");

    const durum = await this.apple.abonelikDurumu(originalTransactionId.trim());
    if (!durum) throw new NotFoundException("Bu satın alma App Store'da bulunamadı.");
    // 1 = aktif, 4 = iptal edildi ama dönem sürüyor. Diğerleri hak vermez.
    if (![1, 4].includes(durum.status)) {
      throw new BadRequestException("Bu abonelik App Store'da etkin değil.");
    }

    const plan = await this.planCoz("app_store", durum.productId);
    return this.billing.aboneligiKaydet({
      userId,
      scope: "user",
      planKey: plan.planKey,
      period: plan.period,
      source: "app_store",
      providerRef: durum.originalTransactionId,
      status: durum.status === 4 ? "canceled" : "active",
      baslangic: new Date(),
    });
  }

  /** Google Play satın almasını doğrular ve aboneliği yazar. */
  async googleDogrula(userId: string, purchaseToken: string): Promise<Abonelik> {
    if (!purchaseToken?.trim()) throw new BadRequestException("Satın alma jetonu eksik.");

    const durum = await this.play.abonelikDurumu(purchaseToken.trim());
    if (!durum) throw new NotFoundException("Bu satın alma Google Play'de bulunamadı.");
    const gecerli = ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"];
    if (!gecerli.includes(durum.state)) {
      throw new BadRequestException("Bu abonelik Google Play'de etkin değil.");
    }

    const plan = await this.planCoz("play_store", durum.productId);
    return this.billing.aboneligiKaydet({
      userId,
      scope: "user",
      planKey: plan.planKey,
      period: plan.period,
      source: "play_store",
      providerRef: durum.purchaseToken,
      status: durum.state === "SUBSCRIPTION_STATE_CANCELED" ? "canceled" : "active",
      baslangic: new Date(),
    });
  }

  /**
   * App Store Server Notifications V2.
   * Bildirimden yalnızca kimlik okunur; durum Apple'a sorulur (bkz. AppleStoreClient).
   */
  async appleBildirimi(signedPayload: unknown): Promise<{ islendi: boolean }> {
    const govde = this.apple.jwsGovdesiniOku(signedPayload);
    const bilgi = this.apple.jwsGovdesiniOku(govde?.data?.signedTransactionInfo);
    const ref = bilgi?.originalTransactionId ?? govde?.data?.originalTransactionId;
    if (!ref) return { islendi: false };

    return this.billing.webhookIsle({
      source: "app_store",
      eventType: String(govde?.notificationType ?? "unknown"),
      providerRef: String(ref),
      // Apple her bildirime tekil bir UUID veriyor; tekrar teslimatta aynı kalır.
      dedupeKey: String(govde?.notificationUUID ?? `${ref}:${govde?.notificationType}:${govde?.signedDate ?? ""}`),
      payload: govde ?? {},
      // İmza doğrulanmıyor ÇÜNKÜ karar bildirime dayanmıyor: durum API'den okunacak.
      signatureOk: false,
    });
  }

  /** Google Play Real-time Developer Notifications (Pub/Sub push). */
  async googleBildirimi(mesaj: { data?: string; messageId?: string }): Promise<{ islendi: boolean }> {
    if (!mesaj?.data) return { islendi: false };
    const bilgi = this.play.bildirimdenJeton(mesaj.data);
    if (!bilgi?.purchaseToken) return { islendi: false };

    return this.billing.webhookIsle({
      source: "play_store",
      eventType: `play.${bilgi.notificationType ?? "unknown"}`,
      providerRef: bilgi.purchaseToken,
      dedupeKey: mesaj.messageId ?? `${bilgi.purchaseToken}:${bilgi.notificationType}`,
      payload: bilgi,
      signatureOk: false,
    });
  }

  /**
   * Mağaza ürün kimliğini plana çevirir.
   * Eşleşme billing_plan_refs'ten gelir: mağazadaki ürün kimliklerini kod
   * bilemez (mağaza panelinde belirlenir) ve değişebilirler.
   */
  private async planCoz(
    provider: OdemeSaglayici,
    productId: string
  ): Promise<{ planKey: PlanKey; period: BillingPeriod }> {
    if (!productId) throw new BadRequestException("Mağaza ürün kimliği okunamadı.");
    const refs = await this.settings.planRefs();
    const eslesme = refs.find((r) => r.provider === provider && r.referenceCode === productId);
    if (!eslesme) {
      this.logger.error(`Tanınmayan mağaza ürünü: ${provider}/${productId}`);
      throw new ServiceUnavailableException("Bu ürün henüz tanımlı değil. Lütfen destek ile iletişime geç.");
    }
    return { planKey: eslesme.planKey, period: eslesme.period };
  }
}
