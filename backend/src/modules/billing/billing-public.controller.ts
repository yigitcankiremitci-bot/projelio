import { Controller, Get } from "@nestjs/common";
import { BillingSettingsService } from "./billing-settings.service";
import { PLANS } from "./billing.plans";
import { CREDIT_PACKAGES } from "../ai-assistant/ai-credits.config";

/**
 * Fiyat listesinin herkese açık hâli — tanıtım sitesi (projelio.app) bunu okur.
 *
 * NEDEN AÇIK BİR UÇ: landing ayrı bir Next.js uygulaması ve npm workspace'i
 * DEĞİL, yani paket kataloğunu içe aktaramıyor. Fiyatı oraya elle kopyalamak,
 * sitede yazan tutarla panelde çekilen tutarın ayrışması demekti — ödeme
 * tarafında yapılabilecek en kötü hatalardan biri. Fiyat zaten kamuya açık
 * bilgi; giriş istemek yalnızca kopyalamayı zorunlu kılardı.
 *
 * Abonelik bilgisi BURADA YOK: bu uç kimseyi tanımaz, yalnızca liste döner.
 */
@Controller("billing/public")
export class BillingPublicController {
  constructor(private settings: BillingSettingsService) {}

  @Get("plans")
  async plans() {
    const refs = await this.settings.planRefs();
    const tutar = (planKey: string, period: "monthly" | "yearly") => {
      const ref = refs.find((r) => r.provider === "iyzico" && r.planKey === planKey && r.period === period);
      if (!ref?.referenceCode || ref.priceAmount === null) return null;
      return { amount: ref.priceAmount, currency: ref.currency };
    };

    return {
      plans: PLANS.filter((p) => p.key !== "free").map((plan) => ({
        key: plan.key,
        name: plan.name,
        priceUsd: { monthly: plan.priceUsdMonthly, yearly: plan.priceUsdYearly },
        charge: { monthly: tutar(plan.key, "monthly"), yearly: tutar(plan.key, "yearly") },
        monthlyCredits: plan.monthlyCredits,
        featured: plan.featured,
        seats: plan.seats,
      })),
    };
  }

  /**
   * Lio Bakiyesi paketleri — landing'in bakiye sayfası bunu okur.
   *
   * Aynı sebep: landing'de paketler elle yazılmıştı ve satılanlarla HİÇ
   * örtüşmüyordu (1.000 birim / 99 ₺ görünürken 25.000 birim / 105 ₺ satılıyordu).
   * Fiyat, siparişin dondurduğu tutarla aynı kaynaktan (CREDIT_PACKAGES) gelir.
   */
  @Get("lio-packages")
  lioPackages() {
    return {
      packages: CREDIT_PACKAGES.map((p) => ({ key: p.key, credits: p.credits, price: p.priceTry })),
    };
  }
}
