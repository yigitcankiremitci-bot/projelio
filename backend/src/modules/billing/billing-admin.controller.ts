import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { BillingService } from "./billing.service";
import { BillingSettingsService, type OdemeSaglayici } from "./billing-settings.service";
import { isBillingPeriod, isPlanKey, PLANS } from "./billing.plans";

const SAGLAYICILAR: OdemeSaglayici[] = ["iyzico", "app_store", "play_store"];

/**
 * Yönetici uçları: sağlayıcıdaki plan kodları/tutarları ve abonelik listesi.
 *
 * NEDEN PANELDEN: iyzico'da bir ödeme planı açınca referans kodu ÜRETİLİR ve
 * fiyat değiştirmek yeni bir plan açmak demektir. Bunu ortam değişkeninde
 * tutmak, her fiyat değişikliğini SSH + yeniden başlatmaya çevirirdi (086'daki
 * model ayarlarında verilen aynı karar).
 */
@Controller("billing/admin")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class BillingAdminController {
  constructor(
    private billing: BillingService,
    private settings: BillingSettingsService
  ) {}

  /** Katalog + sağlayıcıdaki karşılıkları yan yana: eksik olan hemen görünsün. */
  @Get("settings")
  async getSettings() {
    const [refs, kur] = await Promise.all([this.settings.planRefs(), this.settings.usdTryKuru()]);
    return {
      plans: PLANS.filter((p) => p.key !== "free").map((p) => ({
        key: p.key,
        name: p.name,
        priceUsd: { monthly: p.priceUsdMonthly, yearly: p.priceUsdYearly },
        monthlyCredits: p.monthlyCredits,
      })),
      providers: SAGLAYICILAR,
      refs,
      usdTryRate: kur,
    };
  }

  /**
   * Bir planın sağlayıcıdaki karşılığını yazar.
   * Gövde: { provider, planKey, period, referenceCode, priceAmount, currency }
   */
  @Patch("settings/plan-ref")
  async setPlanRef(
    @Body()
    body: {
      provider: string;
      planKey: string;
      period: string;
      referenceCode?: string | null;
      priceAmount?: number | null;
      currency?: string;
    },
    @Req() req: any
  ) {
    const provider = SAGLAYICILAR.find((s) => s === body?.provider);
    if (!provider || !isPlanKey(body?.planKey) || !isBillingPeriod(body?.period)) {
      // Geçersiz bir kayıt, kullanıcının HER satın alma denemesinde sağlayıcıdan
      // hata almasına yol açardı ve sebebi panelde görünmezdi (086'daki tuzağın
      // aynısı).
      return { ok: false, error: "Sağlayıcı, paket ya da dönem geçersiz." };
    }

    const tutar = body.priceAmount === null || body.priceAmount === undefined ? null : Number(body.priceAmount);
    if (tutar !== null && (!Number.isFinite(tutar) || tutar < 0)) {
      return { ok: false, error: "Tutar geçersiz." };
    }

    await this.settings.setPlanRef(
      provider,
      body.planKey,
      body.period,
      {
        referenceCode: body.referenceCode?.trim() || null,
        priceAmount: tutar,
        currency: (body.currency ?? "TRY").toUpperCase().slice(0, 3),
      },
      req.user.userId
    );
    return { ok: true };
  }

  /** Vitrinde $ tutarını ₺ göstermek için kullanılan kur. Tahsilatta KULLANILMAZ. */
  @Patch("settings/usd-try")
  async setUsdTry(@Body() body: { rate?: number | null }, @Req() req: any) {
    const kur = body?.rate === null || body?.rate === undefined ? null : Number(body.rate);
    if (kur !== null && (!Number.isFinite(kur) || kur <= 0)) return { ok: false, error: "Kur geçersiz." };
    await this.settings.setConfig("usd_try_rate", kur === null ? null : String(kur), req.user.userId);
    return { ok: true };
  }

  @Get("subscriptions")
  list(@Query("status") status: string | undefined, @Query("limit") limit: string | undefined) {
    const istenen = Number(limit);
    const tavan = Number.isFinite(istenen) && istenen > 0 ? Math.min(istenen, LISTE_TAVANI) : 100;
    return this.billing.listele(status, tavan);
  }

  /**
   * Dönem bakımını elle tetikler (normalde gecelik cron).
   * Bir kredi yüklemesi atlandığında sabahı beklemek gerekmesin diye var.
   */
  @Post("run-renewals")
  runRenewals() {
    return this.billing.donemleriIlerlet();
  }
}
