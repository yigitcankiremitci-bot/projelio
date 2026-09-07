import { Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import type { BillingPeriod, PlanKey } from "./billing.plans";
import { isBillingPeriod, isPlanKey, PLANS } from "./billing.plans";

export type OdemeSaglayici = "iyzico" | "app_store" | "play_store";

export interface PlanRef {
  provider: OdemeSaglayici;
  planKey: PlanKey;
  period: BillingPeriod;
  /** iyzico'da pricingPlanReferenceCode, mağazalarda ürün kimliği. */
  referenceCode: string | null;
  /** Sağlayıcıda tanımlı GERÇEK tahsilat tutarı. */
  priceAmount: number | null;
  currency: string;
  updatedAt: string | null;
}

/**
 * Sağlayıcı tarafındaki plan karşılıkları ve tahsilat tutarları.
 *
 * NEDEN VERİTABANI: iyzico'nun ödeme planı referans kodu, plan iyzico panelinde
 * açılınca ÜRETİLİR — kodda önceden yazılamaz. Ortam değişkenine koymak her fiyat
 * değişikliğini SSH + yeniden başlatmaya çevirirdi (086'daki model ayarlarıyla
 * aynı gerekçe). Ortam değişkeni yine de okunuyor: tablo boşsa ya da migration
 * uygulanmadıysa sistem çalışmaya devam etsin.
 *
 * ÖNCELİK: veritabanı > ortam değişkeni > yok.
 *
 * TUTAR NEDEN BURADA: vitrin fiyatı USD (billing.plans.ts) ama tahsilat TRY.
 * Çevrilen tutar iyzico'daki planda SABİTTİR; onu canlı kurla her istekte yeniden
 * hesaplamak, kullanıcıya gösterdiğimiz tutarla çekilen tutarın ayrışması demekti.
 * Bu yüzden gerçek tutar sağlayıcıdaki planla birlikte buraya yazılır ve vitrinde
 * o gösterilir.
 */
@Injectable()
export class BillingSettingsService {
  private readonly logger = new Logger(BillingSettingsService.name);
  private cache: { refs: PlanRef[]; config: Record<string, string>; expiresAt: number } | null = null;
  private static readonly CACHE_MS = 30_000;

  private readonly supabase: SupabaseService;

  constructor(@Inject(SupabaseService) supabase: SupabaseService) {
    this.supabase = supabase;
  }

  invalidate(): void {
    this.cache = null;
  }

  async planRefs(): Promise<PlanRef[]> {
    return (await this.yukle()).refs;
  }

  async planRef(provider: OdemeSaglayici, planKey: PlanKey, period: BillingPeriod): Promise<PlanRef | null> {
    const refs = await this.planRefs();
    return refs.find((r) => r.provider === provider && r.planKey === planKey && r.period === period) ?? null;
  }

  /** Vitrinde $ tutarını ₺ göstermek için kullanılan kur (tahsilatta KULLANILMAZ). */
  async usdTryKuru(): Promise<number | null> {
    const config = (await this.yukle()).config;
    const ham = config["usd_try_rate"] ?? process.env.BILLING_USD_TRY;
    const sayi = Number(ham);
    return Number.isFinite(sayi) && sayi > 0 ? sayi : null;
  }

  async setPlanRef(
    provider: OdemeSaglayici,
    planKey: PlanKey,
    period: BillingPeriod,
    degerler: { referenceCode: string | null; priceAmount: number | null; currency: string },
    updatedBy: string
  ): Promise<void> {
    const { error } = await this.supabase.client.from("billing_plan_refs").upsert(
      {
        provider,
        plan_key: planKey,
        period,
        reference_code: degerler.referenceCode,
        price_amount: degerler.priceAmount,
        currency: degerler.currency,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "provider,plan_key,period" }
    );
    if (error) throw error;
    this.invalidate();
  }

  async setConfig(key: string, value: string | null, updatedBy: string): Promise<void> {
    const { error } = await this.supabase.client.from("billing_config").upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: updatedBy },
      { onConflict: "key" }
    );
    if (error) throw error;
    this.invalidate();
  }

  private async yukle(): Promise<{ refs: PlanRef[]; config: Record<string, string> }> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache;

    const varsayilan = this.ortamdanRefler();
    let refs = varsayilan;
    let config: Record<string, string> = {};

    try {
      const [refSonuc, configSonuc] = await Promise.all([
        this.supabase.client.from("billing_plan_refs").select("provider, plan_key, period, reference_code, price_amount, currency, updated_at"),
        this.supabase.client.from("billing_config").select("key, value"),
      ]);
      if (refSonuc.error) throw refSonuc.error;
      if (configSonuc.error) throw configSonuc.error;

      // Veritabanı satırı ortam değişkeninin ÜZERİNE yazar; olmayan satırlar
      // ortamdan gelen değerle kalır.
      const harita = new Map(varsayilan.map((r) => [`${r.provider}|${r.planKey}|${r.period}`, r]));
      for (const row of refSonuc.data ?? []) {
        if (!isPlanKey(row.plan_key) || !isBillingPeriod(row.period)) continue;
        harita.set(`${row.provider}|${row.plan_key}|${row.period}`, {
          provider: row.provider as OdemeSaglayici,
          planKey: row.plan_key,
          period: row.period,
          referenceCode: row.reference_code ?? null,
          priceAmount: row.price_amount === null || row.price_amount === undefined ? null : Number(row.price_amount),
          currency: row.currency ?? "TRY",
          updatedAt: row.updated_at ?? null,
        });
      }
      refs = [...harita.values()];
      config = Object.fromEntries((configSonuc.data ?? []).map((r: any) => [r.key, r.value ?? ""]));
    } catch (error) {
      // Tablolar okunamıyorsa (ör. migration 092 uygulanmadı) abonelik ekranı
      // "yapılandırılmamış" görünür ama uygulama ÇALIŞMAYA DEVAM EDER — 086'daki
      // model ayarlarında verilen aynı karar.
      this.logger.warn(`Fatura ayarları okunamadı, ortam değişkenlerine düşülüyor: ${(error as Error).message}`);
    }

    this.cache = { refs, config, expiresAt: Date.now() + BillingSettingsService.CACHE_MS };
    return this.cache;
  }

  /**
   * Ortam değişkeni karşılıkları:
   *   IYZICO_PLAN_PRO_MONTHLY   = iyzico ödeme planı referans kodu
   *   IYZICO_PRICE_PRO_MONTHLY  = o plandaki TRY tutarı
   *   APPSTORE_PLAN_PRO_MONTHLY / PLAYSTORE_PLAN_PRO_MONTHLY = mağaza ürün kimliği
   */
  private ortamdanRefler(): PlanRef[] {
    const onekler: Array<{ provider: OdemeSaglayici; plan: string; price?: string; currency: string }> = [
      { provider: "iyzico", plan: "IYZICO_PLAN", price: "IYZICO_PRICE", currency: "TRY" },
      { provider: "app_store", plan: "APPSTORE_PLAN", currency: "USD" },
      { provider: "play_store", plan: "PLAYSTORE_PLAN", currency: "USD" },
    ];

    const sonuc: PlanRef[] = [];
    for (const { provider, plan, price, currency } of onekler) {
      for (const p of PLANS) {
        if (p.key === "free") continue;
        for (const period of ["monthly", "yearly"] as BillingPeriod[]) {
          const sonek = `${p.key.toUpperCase()}_${period.toUpperCase()}`;
          const referenceCode = process.env[`${plan}_${sonek}`]?.trim() || null;
          const tutar = price ? Number(process.env[`${price}_${sonek}`]) : NaN;
          if (!referenceCode && !Number.isFinite(tutar)) continue;
          sonuc.push({
            provider,
            planKey: p.key,
            period,
            referenceCode,
            priceAmount: Number.isFinite(tutar) ? tutar : null,
            currency,
            updatedAt: null,
          });
        }
      }
    }
    return sonuc;
  }
}
