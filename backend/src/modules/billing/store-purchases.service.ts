import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { AppleStoreClient } from "./apple-store.client";
import { GooglePlayClient, playObfuscatedAccountId, type PlayAbonelikDurumu } from "./google-play.client";
import { BillingService, type Abonelik, type AbonelikDurumu } from "./billing.service";
import { BillingSettingsService, type OdemeSaglayici } from "./billing-settings.service";
import { magazaUrunleri, type MagazaUrunu } from "./magaza-urunleri";
import { playAbonelikDurumu } from "./play-abonelik-durumu";
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

  /**
   * Mobil istemcinin mağaza akışını kurabilmesi için gereken her şey.
   *
   * ÜRÜN KİMLİKLERİ BURADAN GELİYOR, İSTEMCİYE GÖMÜLMÜYOR. Mağaza ürün
   * kimlikleri mağaza panelinde belirleniyor ve değişebiliyor; istemciye
   * gömülseler bir ürün yeniden adlandırıldığında uygulamanın yeni sürümünü
   * yayınlayıp kullanıcıların güncellemesini beklemek gerekirdi. Eşleştirme
   * zaten billing_plan_refs'te duruyor (satın alma doğrulanırken de oradan
   * okunuyor, bkz. planCoz) — tek kaynak orası.
   *
   * Yalnızca referans kodu TANIMLI olanlar dönüyor: tanımsız bir plan mağazada
   * yok demektir, istemcinin onu sorması sağlayıcıdan hata almasına yol açardı.
   */
  async durum(userId: string): Promise<{
    appStore: boolean;
    playStore: boolean;
    googleObfuscatedAccountId: string;
    products: MagazaUrunu[];
  }> {
    const refs = await this.settings.planRefs();
    return {
      appStore: this.apple.isConfigured(),
      playStore: this.play.isConfigured(),
      // Mobil istemci bunu BillingFlowParams.setObfuscatedAccountId'e verir;
      // backend satın alma döndüğünde aynı hesabı doğrular.
      googleObfuscatedAccountId: playObfuscatedAccountId(userId),
      products: magazaUrunleri(refs),
    };
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
    this.googleHesabiniDogrula(userId, durum);
    const status = playAbonelikDurumu(durum, new Date());
    if (!status || !["active", "past_due", "canceled"].includes(status)) {
      throw new BadRequestException("Bu abonelik Google Play'de etkin değil.");
    }
    return this.googleAboneliginiKaydet(userId, durum, status, true);
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

    // RTDN yalnızca "şu token değişti" sinyalidir. Hak ve süre kararı daima
    // subscriptionsv2.get yanıtından verilir.
    const durum = await this.play.abonelikDurumu(bilgi.purchaseToken);
    if (!durum) return { islendi: false };
    const mevcut = await this.billing.abonelikSaglayiciReferansiyla("play_store", durum.purchaseToken);
    const onceki = !mevcut && durum.linkedPurchaseToken
      ? await this.billing.abonelikSaglayiciReferansiyla("play_store", durum.linkedPurchaseToken)
      : null;
    const sahip = mevcut ?? onceki;
    // İlk satın alma RTDN'si uygulamanın doğrulama isteğinden önce gelebilir.
    // Hash tek yönlü olduğu için buradan kullanıcı kimliği türetilmez; istemcinin
    // /store/google çağrısı kaydı güvenle açar.
    if (!sahip) return { islendi: false };
    this.googleHesabiniDogrula(sahip.userId, durum);
    const status = playAbonelikDurumu(durum, new Date());
    if (!status) throw new ServiceUnavailableException("Google Play bilinmeyen bir abonelik durumu döndürdü.");

    return this.billing.webhookIsle(
      {
        source: "play_store",
        eventType: `play.${bilgi.notificationType ?? "unknown"}`,
        providerRef: bilgi.purchaseToken,
        dedupeKey: mesaj.messageId ?? `${bilgi.purchaseToken}:${bilgi.notificationType}`,
        payload: bilgi,
        signatureOk: false,
      },
      async () => {
        await this.googleAboneliginiKaydet(sahip.userId, durum, status, true);
      }
    );
  }

  private googleHesabiniDogrula(userId: string, durum: PlayAbonelikDurumu): void {
    const beklenen = playObfuscatedAccountId(userId);
    if (!durum.obfuscatedExternalAccountId || durum.obfuscatedExternalAccountId !== beklenen) {
      throw new BadRequestException("Google Play satın alması bu Projelio hesabıyla eşleşmiyor.");
    }
  }

  private async googleAboneliginiKaydet(
    userId: string,
    durum: PlayAbonelikDurumu,
    status: AbonelikDurumu,
    acknowledge: boolean
  ): Promise<Abonelik> {
    if (!durum.expiryTime || !Number.isFinite(durum.expiryTime.getTime())) {
      throw new ServiceUnavailableException("Google Play abonelik bitiş tarihini döndürmedi.");
    }

    const mevcut = await this.billing.abonelikSaglayiciReferansiyla("play_store", durum.purchaseToken);
    if (mevcut && mevcut.userId !== userId) {
      throw new BadRequestException("Google Play satın alması başka bir Projelio hesabına bağlı.");
    }
    if (!mevcut && durum.linkedPurchaseToken) {
      await this.billing.magazaReferansiniDegistir("play_store", durum.linkedPurchaseToken, durum.purchaseToken, userId);
    }

    const plan = await this.planCoz("play_store", durum.productId);
    // AYNI SORGU İKİNCİ KEZ, BİLEREK: yukarıdaki `mevcut` referans DEVRİNDEN
    // ÖNCE okundu. Plan değiştiğinde magazaReferansiniDegistir eski satırı yeni
    // purchase token'a taşıyor; dönem başlangıcını o taşınmış satırdan almak
    // için taze okuma gerekiyor. Tek sorguya indirilirse yükseltme yapan
    // kullanıcının dönem başlangıcı bugüne kayar ve kredi ayı bozulur.
    const onceki = await this.billing.abonelikSaglayiciReferansiyla("play_store", durum.purchaseToken);
    const baslangic = durum.startTime && Number.isFinite(durum.startTime.getTime())
      ? durum.startTime
      : onceki?.currentPeriodStart
        ? new Date(onceki.currentPeriodStart)
        : new Date();
    const abonelik = await this.billing.aboneligiKaydet({
      userId,
      scope: "user",
      planKey: plan.planKey,
      period: plan.period,
      source: "play_store",
      providerRef: durum.purchaseToken,
      status,
      baslangic,
      bitis: durum.expiryTime,
    });

    if (acknowledge && durum.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      await this.play.aboneligiOnayla(durum.purchaseToken, durum.productId);
    }
    return abonelik;
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

