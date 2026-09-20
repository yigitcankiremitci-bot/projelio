import { Controller, Get } from "@nestjs/common";
import { BillingSettingsService } from "./billing-settings.service";
import { PLANS, type Plan } from "./billing.plans";
import { abonelikTutari, aylikKarsilikTl } from "./abonelik-tutari";
import { AiCreditOrdersService } from "../ai-assistant/ai-credit-orders.service";

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
  constructor(
    private settings: BillingSettingsService,
    private creditOrders: AiCreditOrdersService
  ) {}

  @Get("plans")
  async plans() {
    const [refs, kur] = await Promise.all([this.settings.planRefs(), this.settings.usdTryKuru()]);
    // Tahsilat tutarı katalog + kurdan hesaplanır; sağlayıcıda sabitlenmiş bir
    // tutar varsa o öne geçer (bkz. abonelik-tutari.ts). Eskiden yalnızca
    // iyzico plan kodu varsa tutar gösteriliyordu: iyzico'dan vazgeçilince
    // site aylarca TL fiyat göstermedi, yalnızca dolar göründü.
    const tutar = (plan: Plan, period: "monthly" | "yearly") =>
      abonelikTutari(plan, period, kur, refs.find((r) => r.planKey === plan.key && r.period === period));

    return {
      plans: PLANS.filter((p) => p.key !== "free").map((plan) => ({
        key: plan.key,
        name: plan.name,
        priceUsd: { monthly: plan.priceUsdMonthly, yearly: plan.priceUsdYearly, yearlyMonthly: plan.priceUsdYearlyMonthly },
        charge: {
          monthly: tutar(plan, "monthly"),
          yearly: tutar(plan, "yearly"),
          /** Yıllık ödemede vitrindeki büyük rakamın TL karşılığı. */
          yearlyMonthly: aylikKarsilikTl(plan, kur),
        },
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
   * Fiyat, sipariş açılırken dondurulan tutarla aynı hesaptan (admin kuru ×
   * USD, 10 ₺'ye yukarı) gelir — uygulamadaki paket ekranıyla birebir.
   */
  @Get("lio-packages")
  async lioPackages() {
    const paketler = await this.creditOrders.listPackages();
    return {
      packages: paketler.map((p) => ({ key: p.key, credits: p.credits, price: p.priceTry })),
    };
  }
}
