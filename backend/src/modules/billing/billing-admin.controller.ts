import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { tlFiyat } from "@projelio/shared";
import { USD_TRY_AYAR_ANAHTARI } from "../../common/usd-try-kuru";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { BillingService } from "./billing.service";
import { BillingSettingsService, type OdemeSaglayici } from "./billing-settings.service";
import { isBillingPeriod, isPlanKey, PLANS } from "./billing.plans";
import { kurSapmasi } from "./tcmb-kuru";
import { TcmbKuruService } from "./tcmb-kuru.service";

const SAGLAYICILAR: OdemeSaglayici[] = ["iyzico", "app_store", "play_store"];
/** Web'de TL tahsilatın tutar satırları. Tablodaki adı hâlâ "iyzico"; PayTR aboneliği gelince aynı satırlar kullanılmalı. */
const TL_SAGLAYICI: OdemeSaglayici = "iyzico";

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
    private settings: BillingSettingsService,
    private tcmb: TcmbKuruService
  ) {}

  /** Katalog + sağlayıcıdaki karşılıkları yan yana: eksik olan hemen görünsün. */
  @Get("settings")
  async getSettings() {
    const [refs, kur, tcmb] = await Promise.all([
      this.settings.planRefs(),
      this.settings.usdTryKuru(),
      this.tcmb.usdKuru(),
    ]);
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
      /**
       * TCMB günlük bülteni — yalnızca BİLGİ. Tahsilat tutarı `refs` içinde
       * sabittir, bu kurla hesaplanmaz (bkz. billing.plans.ts başlığı).
       * Bülten alınamazsa null gelir ve ekran kur satırını hiç göstermez.
       */
      tcmb: tcmb && {
        tarih: tcmb.tarih,
        forexSelling: tcmb.forexSelling,
        banknoteSelling: tcmb.banknoteSelling,
        /** Elle girilen kurun efektif satışa göre ne kadar geride kaldığı. */
        sapma: kur === null ? null : kurSapmasi(kur, tcmb.banknoteSelling),
      },
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

  /**
   * USD/TRY kurunu kaydeder VE paketlerin TL tutarlarını bu kurdan yeniden yazar
   * (USD × kur, 10 ₺'ye yukarı yuvarlanmış — bkz. shared/tlFiyat).
   *
   * Eskiden kur yalnızca vitrindeydi, TL tutarlar elle giriliyordu: kur
   * güncellenip tutarlar unutulunca panel "kur %X geride" deyip duruyordu.
   * Artık tek adım. Referans kodu KORUNUR, yalnızca tutar değişir.
   *
   * TAHSİLAT: PayTR'de tutarı her ödemede biz gönderiyoruz, yani yeni tutar bir
   * sonraki ödemede geçerli olur. iyzico'nun sabit tutarlı planlarıyla çalışırken
   * bu otomatik yazma YANLIŞ olurdu (planı yeniden açmak gerekirdi); iyzico'ya
   * dönülürse burası gözden geçirilmeli.
   */
  @Patch("settings/usd-try")
  async setUsdTry(@Body() body: { rate?: number | null }, @Req() req: any) {
    const kur = body?.rate === null || body?.rate === undefined ? null : Number(body.rate);
    if (kur !== null && (!Number.isFinite(kur) || kur <= 0)) return { ok: false, error: "Kur geçersiz." };
    await this.settings.setConfig(USD_TRY_AYAR_ANAHTARI, kur === null ? null : String(kur), req.user.userId);
    // Kur silinirse tutarlara dokunulmaz: son bilinen fiyatla satış sürer,
    // kursuz bir "0 ₺" ya da boş tutar yazmak satışı durdururdu.
    if (kur === null) return { ok: true };

    const refs = await this.settings.planRefs();
    for (const plan of PLANS.filter((p) => p.priceUsdMonthly > 0)) {
      for (const period of ["monthly", "yearly"] as const) {
        const tutar = tlFiyat(period === "monthly" ? plan.priceUsdMonthly : plan.priceUsdYearly, kur);
        if (tutar === null) continue;
        const mevcut = refs.find((r) => r.provider === TL_SAGLAYICI && r.planKey === plan.key && r.period === period);
        await this.settings.setPlanRef(
          TL_SAGLAYICI,
          plan.key,
          period,
          { referenceCode: mevcut?.referenceCode ?? null, priceAmount: tutar, currency: "TRY" },
          req.user.userId
        );
      }
    }
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
