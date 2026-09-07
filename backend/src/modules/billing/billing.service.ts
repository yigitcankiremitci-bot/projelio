import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { AiCreditsService } from "../ai-assistant/ai-credits.service";
import { demoHesabindaYasak } from "../../common/demo-hesap";
import { getWebAppUrl } from "../../common/config/env";
import { BillingSettingsService, type OdemeSaglayici } from "./billing-settings.service";
import { IyzicoClient, IyzicoHatasi } from "./iyzico.client";
import {
  ayEkle,
  krediAyiBasi,
  findPlan,
  FREE_PLAN,
  isBillingPeriod,
  isPlanKey,
  periodMonths,
  PLANS,
  planPriceUsd,
  SATIN_ALINABILIR,
  type BillingPeriod,
  type Plan,
  type PlanKey,
} from "./billing.plans";

export type AbonelikDurumu = "pending" | "trialing" | "active" | "past_due" | "canceled" | "expired";
export type AbonelikKapsami = "user" | "organization";
export type AbonelikKaynagi = OdemeSaglayici | "manual";

export interface Abonelik {
  id: string;
  scope: AbonelikKapsami;
  userId: string;
  organizationId?: string;
  planKey: PlanKey;
  period: BillingPeriod;
  status: AbonelikDurumu;
  source: AbonelikKaynagi;
  providerRef?: string;
  providerCustomerRef?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  priceAmount?: number;
  currency: string;
  priceUsd?: number;
  createdAt: string;
}

/**
 * Hak veren durumlar. İkisi de bilinçli:
 *   · past_due — tek bir başarısız çekim erişimi kesmez, sağlayıcı yeniden deniyor.
 *   · canceled — ödenmiş dönem sonuna kadar kullanmaya devam edilir.
 */
const HAK_VEREN: AbonelikDurumu[] = ["trialing", "active", "past_due", "canceled"];

/**
 * "Yeni paket almasını engelleyen" durumlar. HAK_VEREN'den farkı 'canceled':
 * iptal etmiş biri dönem sonunu beklemeden geri dönebilmeli, yoksa fikrini
 * değiştiren müşteriyi haftalarca bekletmiş oluruz. Veritabanındaki kısmi
 * tekil indeks de aynı listeyi kullanıyor (migration 092).
 */
const YURURLUKTE: AbonelikDurumu[] = ["trialing", "active", "past_due"];

function mapAbonelik(row: any): Abonelik {
  return {
    id: row.id,
    scope: row.scope,
    userId: row.user_id,
    organizationId: row.organization_id ?? undefined,
    planKey: row.plan_key,
    period: row.period,
    status: row.status,
    source: row.source,
    providerRef: row.provider_ref ?? undefined,
    providerCustomerRef: row.provider_customer_ref ?? undefined,
    currentPeriodStart: row.current_period_start ?? undefined,
    currentPeriodEnd: row.current_period_end ?? undefined,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    canceledAt: row.canceled_at ?? undefined,
    priceAmount: row.price_amount === null || row.price_amount === undefined ? undefined : Number(row.price_amount),
    currency: row.currency ?? "TRY",
    priceUsd: row.price_usd === null || row.price_usd === undefined ? undefined : Number(row.price_usd),
    createdAt: row.created_at,
  };
}

/**
 * Abonelik çekirdeği: paket satın alma, yenileme, iptal ve dönemlik kredi.
 *
 * ÜÇ AYRI KANAL, TEK MODEL: iyzico (web), App Store ve Google Play. Kanal
 * farkı yalnızca "ödemenin doğrulanması"nda; doğrulandıktan sonrası (abonelik
 * satırı, dönem sınırı, kredi yüklemesi) ORTAK. Mağaza tarafı bugün kapalı ama
 * ortak gövdeye bağlanmış durumda — açıldığında kredi mantığı yeniden yazılmayacak.
 *
 * DEĞİŞMEZ KURALLAR:
 *   1. Abonelik satırı açmak kredi YÜKLEMEZ. Kredi yalnızca krediYukle()'den geçer
 *      ve (subscription_id, period_start) tekil indeksi yüzünden dönem başına bir kez.
 *   2. Ödemenin kanıtı sağlayıcının API'sidir, tarayıcının callback'e dönmesi değil.
 *      Callback adresine elle de gidilebilir.
 *   3. Fiyat ve kredi miktarı İSTEMCİDEN ALINMAZ; sunucudaki katalogdan yazılır.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  private readonly supabase: SupabaseService;
  private readonly credits: AiCreditsService;
  private readonly settings: BillingSettingsService;
  private readonly iyzico: IyzicoClient;

  constructor(
    @Inject(SupabaseService) supabase: SupabaseService,
    @Inject(AiCreditsService) credits: AiCreditsService,
    @Inject(BillingSettingsService) settings: BillingSettingsService,
    @Inject(IyzicoClient) iyzico: IyzicoClient
  ) {
    this.supabase = supabase;
    this.credits = credits;
    this.settings = settings;
    this.iyzico = iyzico;
  }

  // ==================================================================== Vitrin

  /**
   * Paket listesi + kullanıcının mevcut durumu.
   *
   * Tutar iki başlı gösteriliyor: vitrin fiyatı USD (katalog), tahsilat tutarı
   * sağlayıcıdaki plandan (billing_plan_refs). İkincisi tanımlı değilse o plan
   * satın alınamaz — kullanıcıya "şu kadar" deyip başka bir tutar çekmektense
   * düğmeyi kapatmak doğru davranış.
   */
  async vitrin(userId: string): Promise<{
    plans: Array<{
      key: PlanKey;
      name: string;
      priceUsd: { monthly: number; yearly: number };
      /** Sağlayıcıdaki gerçek tahsilat tutarı; null ise bu dönem satın alınamaz. */
      charge: { monthly: { amount: number; currency: string } | null; yearly: { amount: number; currency: string } | null };
      monthlyCredits: number;
      featured: boolean;
      seats: number;
      features: string[];
    }>;
    subscription: Abonelik | null;
    /** Ödeme sağlayıcısı bağlı mı; değilse arayüz "yakında" der. */
    paymentConfigured: boolean;
    /** Kum havuzunda mıyız — arayüzde test uyarısı için. */
    testMode: boolean;
    usdTryRate: number | null;
  }> {
    const [refs, kur, abonelik] = await Promise.all([
      this.settings.planRefs(),
      this.settings.usdTryKuru(),
      this.aktifAbonelik(userId),
    ]);

    const tutar = (plan: Plan, period: BillingPeriod) => {
      const ref = refs.find((r) => r.provider === "iyzico" && r.planKey === plan.key && r.period === period);
      if (!ref?.referenceCode || ref.priceAmount === null) return null;
      return { amount: ref.priceAmount, currency: ref.currency };
    };

    return {
      plans: PLANS.map((plan) => ({
        key: plan.key,
        name: plan.name,
        priceUsd: { monthly: plan.priceUsdMonthly, yearly: plan.priceUsdYearly },
        charge:
          plan.key === "free"
            ? { monthly: null, yearly: null }
            : { monthly: tutar(plan, "monthly"), yearly: tutar(plan, "yearly") },
        monthlyCredits: plan.monthlyCredits,
        featured: plan.featured,
        seats: plan.seats,
        features: plan.features,
      })),
      subscription: abonelik,
      paymentConfigured: this.iyzico.isConfigured(),
      testMode: this.iyzico.isConfigured() && !this.iyzico.isLive(),
      usdTryRate: kur,
    };
  }

  // ============================================================== Sorgulamalar

  /** Kullanıcının kendi (bireysel) aboneliği. */
  async aktifAbonelik(userId: string): Promise<Abonelik | null> {
    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("scope", "user")
      .in("status", HAK_VEREN)
      // İptal edilmiş bir abonelik dönem sonuna kadar hak vermeye devam ederken
      // yenisi alınabiliyor; o aralıkta iki satır olur ve YENİSİ geçerlidir.
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAbonelik(data) : null;
  }

  async organizasyonAboneligi(organizationId: string): Promise<Abonelik | null> {
    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("scope", "organization")
      .in("status", HAK_VEREN)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAbonelik(data) : null;
  }

  /**
   * Kullanıcı için YÜRÜRLÜKTEKİ plan.
   *
   * Sıra: kendi aboneliği > üyesi olduğu şirketlerin en yüksek planı > ücretsiz.
   * Şirket aboneliğinin üyeye de hak vermesi bilinçli: parayı şirket ödüyor,
   * çalışanın ayrıca abone olması beklenemez. Krediler ise yalnızca fatura
   * sahibine yüklenir (bkz. krediYukle) — ortak kredi havuzu henüz yok.
   */
  async aktifPlan(userId: string): Promise<{ plan: Plan; subscription: Abonelik | null }> {
    const kendi = await this.aktifAbonelik(userId);
    if (kendi && this.donemGecerli(kendi)) {
      return { plan: findPlan(kendi.planKey) ?? FREE_PLAN, subscription: kendi };
    }

    const { data, error } = await this.supabase.client
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId);
    if (error) throw error;

    const orgIds = (data ?? []).map((r: any) => r.organization_id).filter(Boolean);
    if (!orgIds.length) return { plan: FREE_PLAN, subscription: null };

    const { data: abonelikler, error: abonelikHatasi } = await this.supabase.client
      .from("subscriptions")
      .select("*")
      .eq("scope", "organization")
      .in("organization_id", orgIds)
      .in("status", HAK_VEREN);
    if (abonelikHatasi) throw abonelikHatasi;

    let enIyi: { plan: Plan; subscription: Abonelik } | null = null;
    for (const row of abonelikler ?? []) {
      const abonelik = mapAbonelik(row);
      if (!this.donemGecerli(abonelik)) continue;
      const plan = findPlan(abonelik.planKey);
      if (!plan) continue;
      if (!enIyi || plan.monthlyCredits > enIyi.plan.monthlyCredits) enIyi = { plan, subscription: abonelik };
    }
    return enIyi ?? { plan: FREE_PLAN, subscription: null };
  }

  /**
   * İptal edilmiş ya da ödemesi gecikmiş abonelik dönem sonuna kadar hak verir;
   * dönem geçmişse vermez. Süre dolduğunda satırı 'expired' yapan iş
   * donemleriIlerlet() ama ona güvenmiyoruz: cron gecikirse hak sızmasın.
   */
  private donemGecerli(abonelik: Abonelik): boolean {
    if (!abonelik.currentPeriodEnd) return abonelik.status === "active" || abonelik.status === "trialing";
    return new Date(abonelik.currentPeriodEnd).getTime() > Date.now();
  }

  // ================================================================== Satın alma

  /**
   * Ödeme formunu başlatır. Abonelik satırı 'pending' olarak AÇILMAZ — iyzico'dan
   * dönen token doğrulanana kadar hiçbir kayıt yaratmıyoruz.
   *
   * NEDEN: yarım kalan denemeler (kullanıcı formu kapattı) tabloyu doldururdu ve
   * her biri "aktif abonelik var mı" kontrolünü kirletirdi. Ödeme sonucunu
   * çekmek için gereken tek şey token; onu istemciye dönüyoruz.
   */
  async checkoutBaslat(
    userId: string,
    istek: { planKey: string; period: string; scope?: string; organizationId?: string }
  ): Promise<{ token: string; checkoutFormContent: string }> {
    demoHesabindaYasak(userId, "abonelik satın alma");

    const { planKey, period, scope, organizationId } = this.istegiDogrula(istek);
    if (!this.iyzico.isConfigured()) {
      throw new ServiceUnavailableException("Ödeme sağlayıcısı henüz yapılandırılmamış.");
    }

    if (scope === "organization") await this.organizasyonSahibiMi(userId, organizationId!);

    // Yürürlükte bir abonelik varsa ikincisini SATTIRMIYORUZ: iki abonelik iki
    // kez tahsilat demek ve hangisinin geçerli olduğu belirsizleşir. İPTAL
    // EDİLMİŞ abonelik engel değil — fikrini değiştiren kişi dönem sonunu
    // beklemeden geri dönebilmeli (bkz. YURURLUKTE).
    const mevcut = scope === "user" ? await this.aktifAbonelik(userId) : await this.organizasyonAboneligi(organizationId!);
    if (mevcut && YURURLUKTE.includes(mevcut.status)) {
      throw new ConflictException(
        "Zaten bir paketin var. Değiştirmek için önce mevcut aboneliği iptal et ya da destekten yardım iste."
      );
    }

    const ref = await this.settings.planRef("iyzico", planKey, period);
    if (!ref?.referenceCode) {
      throw new ServiceUnavailableException("Bu paket şu an satın alınamıyor. Lütfen bizimle iletişime geç.");
    }

    const kullanici = await this.kullaniciBilgisi(userId);
    // conversationId ile sipariş takibi: iyzico bunu webhook'a ve sonuç
    // çağrısına aynen geri veriyor, hangi kullanıcının denemesi olduğunu buradan
    // eşliyoruz. Kapsam bilgisi de içinde — callback'te tekrar sormaya gerek kalmasın.
    const conversationId = [userId, scope, organizationId ?? "-", planKey, period, Date.now()].join(":");

    try {
      const sonuc = await this.iyzico.checkoutFormBaslat({
        pricingPlanReferenceCode: ref.referenceCode,
        callbackUrl: `${this.callbackTabani()}/billing/iyzico/callback`,
        conversationId,
        customer: {
          name: kullanici.ad,
          surname: kullanici.soyad,
          email: kullanici.email,
          gsmNumber: kullanici.telefon,
          billingAddress: {
            contactName: `${kullanici.ad} ${kullanici.soyad}`.trim(),
            city: "İstanbul",
            country: "Türkiye",
            // Fatura adresi iyzico'da zorunlu ama bizde toplanmıyor; sipariş
            // sanal ürün olduğu için teslimat adresi anlamsız. Boş göndermek
            // reddedilir, o yüzden bir yer tutucu gidiyor. Fatura bilgisi
            // toplamaya başlanırsa BURASI gerçek adresle değişmeli.
            address: kullanici.adres ?? "Elektronik teslimat",
          },
        },
      });
      return { token: sonuc.token, checkoutFormContent: sonuc.checkoutFormContent };
    } catch (error) {
      if (error instanceof IyzicoHatasi) {
        this.logger.warn(`Checkout başlatılamadı (${planKey}/${period}): ${error.message}`);
        throw new BadRequestException(`Ödeme başlatılamadı: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Ödeme formunun sonucunu iyzico'dan çeker ve başarılıysa aboneliği yazar.
   *
   * Hem tarayıcı callback'i hem de kullanıcının "durumu yenile" düğmesi buraya
   * düşer; İKİ KEZ ÇAĞRILMASI GÜVENLİ (provider_ref üzerindeki tekil indeks +
   * kredi tarafındaki dönem tekilliği).
   */
  async checkoutSonucunuIsle(token: string): Promise<Abonelik | null> {
    if (!token?.trim()) throw new BadRequestException("Ödeme jetonu eksik.");

    const sonuc = await this.iyzico.checkoutSonucu(token.trim());
    const referenceCode = String(sonuc.referenceCode ?? "");
    const durum = String(sonuc.subscriptionStatus ?? "").toUpperCase();
    if (!referenceCode) {
      this.logger.warn("iyzico checkout sonucunda abonelik referansı yok; abonelik açılmadı.");
      return null;
    }
    if (durum && !["ACTIVE", "TRIAL", "PENDING"].includes(durum)) {
      this.logger.warn(`Checkout sonucu '${durum}' — abonelik açılmadı (${referenceCode}).`);
      return null;
    }

    const conversationId = String((sonuc as any).conversationId ?? "");
    const kimlik = this.conversationCoz(conversationId);
    if (!kimlik) {
      // Bu, iyzico'dan tanımadığımız bir sonuç geldiği anlamına gelir. Sessizce
      // yutmak, ödemesi alınmış bir kullanıcıyı paketsiz bırakırdı: log'a düşsün
      // ve yönetici elle bağlayabilsin.
      this.logger.error(`Checkout sonucu eşlenemedi (conversationId="${conversationId}", ref=${referenceCode}).`);
      return null;
    }

    return this.aboneligiKaydet({
      ...kimlik,
      source: "iyzico",
      providerRef: referenceCode,
      providerCustomerRef: sonuc.customerReferenceCode ? String(sonuc.customerReferenceCode) : undefined,
      status: durum === "PENDING" ? "pending" : "active",
      baslangic: this.tariheCevir(sonuc.startDate) ?? new Date(),
    });
  }

  /**
   * Aboneliği yazar/günceller ve dönem kredisini yükler.
   *
   * provider_ref üzerindeki tekil indeks sayesinde aynı sağlayıcı aboneliği için
   * ikinci satır AÇILAMAZ; bu yüzden upsert kullanılıyor (yarışta ikinci çağrı
   * mevcut satırı günceller, yenisini yaratmaz).
   */
  async aboneligiKaydet(params: {
    userId: string;
    scope: AbonelikKapsami;
    organizationId?: string;
    planKey: PlanKey;
    period: BillingPeriod;
    source: AbonelikKaynagi;
    providerRef: string;
    providerCustomerRef?: string;
    status: AbonelikDurumu;
    baslangic: Date;
  }): Promise<Abonelik> {
    const plan = findPlan(params.planKey) ?? FREE_PLAN;
    const ref = await this.settings.planRef(params.source === "manual" ? "iyzico" : params.source, params.planKey, params.period);
    const bitis = ayEkle(params.baslangic, periodMonths(params.period));

    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .upsert(
        {
          scope: params.scope,
          user_id: params.userId,
          organization_id: params.organizationId ?? null,
          plan_key: params.planKey,
          period: params.period,
          status: params.status,
          source: params.source,
          provider_ref: params.providerRef,
          provider_customer_ref: params.providerCustomerRef ?? null,
          current_period_start: params.baslangic.toISOString(),
          current_period_end: bitis.toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          price_amount: ref?.priceAmount ?? null,
          currency: ref?.currency ?? "TRY",
          price_usd: planPriceUsd(plan, params.period),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source,provider_ref" }
      )
      .select()
      .single();
    if (error) throw error;

    const abonelik = mapAbonelik(data);
    if (abonelik.status === "active" || abonelik.status === "trialing") {
      await this.krediYukle(abonelik, params.baslangic);
    }
    return abonelik;
  }

  // =================================================================== Kredi

  /**
   * Bir döneme ait paket kredisini yükler — DÖNEM BAŞINA EN FAZLA BİR KEZ.
   *
   * Sıra bilinçli: önce "yer tutma" satırı yazılır (tekil indeks ikinci çağrıyı
   * burada keser), sonra kredi yüklenir. Ters sırada iki eşzamanlı çağrı da
   * "yükleme yok" görüp krediyi iki kez yükleyebilirdi.
   *
   * Yükleme başarısız olursa yer tutma satırı SİLİNİR: aksi halde o dönemin
   * kredisi bir daha hiç yüklenemezdi (indeks yeniden denemeyi de bloklardı).
   */
  async krediYukle(abonelik: Abonelik, donemBasi: Date): Promise<boolean> {
    const plan = findPlan(abonelik.planKey);
    if (!plan || plan.monthlyCredits <= 0) return false;

    const donemIso = donemBasi.toISOString();
    const { data: yerTutma, error: eklemeHatasi } = await this.supabase.client
      .from("subscription_credit_grants")
      .insert({
        subscription_id: abonelik.id,
        period_start: donemIso,
        credits: plan.monthlyCredits,
        granted_to: abonelik.userId,
      })
      .select("id")
      .maybeSingle();

    if (eklemeHatasi) {
      // 23505 = tekil indeks ihlali: bu dönemin kredisi zaten yüklenmiş. Hata değil.
      if ((eklemeHatasi as any).code === "23505") return false;
      throw eklemeHatasi;
    }

    try {
      await this.credits.grant(
        abonelik.userId,
        plan.monthlyCredits,
        "topup",
        `Paket kredisi: ${plan.name} (${donemIso.slice(0, 10)})`
      );
    } catch (error) {
      await this.supabase.client.from("subscription_credit_grants").delete().eq("id", yerTutma?.id);
      this.logger.error(`Paket kredisi yüklenemedi (abonelik ${abonelik.id}): ${(error as Error).message}`);
      throw error;
    }

    // Defter satırıyla bağı kurmak SADECE denetim içindir; kurulamazsa kredi
    // yine yüklenmiştir, bu yüzden hata yutuluyor.
    try {
      const { data: hareket } = await this.supabase.client
        .from("ai_credit_transactions")
        .select("id")
        .eq("user_id", abonelik.userId)
        .eq("type", "topup")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hareket?.id && yerTutma?.id) {
        await this.supabase.client
          .from("subscription_credit_grants")
          .update({ transaction_id: hareket.id })
          .eq("id", yerTutma.id);
      }
    } catch {
      /* denetim bağı kurulamadı, kredi yüklendi */
    }

    this.logger.log(`Paket kredisi yüklendi: ${plan.monthlyCredits} kredi -> ${abonelik.userId} (${abonelik.id}).`);
    return true;
  }

  // =================================================================== İptal

  /**
   * Aboneliği iptal eder. Erişim DÖNEM SONUNA KADAR sürer: ödenmiş bir dönemi
   * anında kesmek, iade talebi ve haklı şikâyet üretir.
   */
  async iptalEt(userId: string, subscriptionId: string): Promise<Abonelik> {
    const abonelik = await this.abonelikBul(subscriptionId);
    if (abonelik.userId !== userId) throw new ForbiddenException("Bu abonelik sana ait değil.");
    if (abonelik.status === "canceled" || abonelik.status === "expired") {
      throw new ConflictException("Bu abonelik zaten iptal edilmiş.");
    }

    if (abonelik.source !== "iyzico") {
      // Mağaza aboneliği bizden iptal EDİLEMEZ; Apple/Google kendi kurallarını
      // uygular ve iptali yalnızca kendi arayüzünden kabul eder.
      throw new BadRequestException(
        abonelik.source === "app_store"
          ? "Bu abonelik App Store üzerinden alınmış; iptali iPhone Ayarlar > Apple Kimliği > Abonelikler'den yapılır."
          : abonelik.source === "play_store"
            ? "Bu abonelik Google Play üzerinden alınmış; iptali Play Store > Abonelikler'den yapılır."
            : "Bu abonelik elle tanımlanmış; iptal için destek ile iletişime geç."
      );
    }

    if (abonelik.providerRef) {
      try {
        await this.iyzico.iptalEt(abonelik.providerRef);
      } catch (error) {
        if (error instanceof IyzicoHatasi) {
          // Sağlayıcıda zaten iptal edilmişse bizim tarafı da kapatmak DOĞRU:
          // hata fırlatmak, kullanıcıyı ödemeyen ama abone görünen bir kayda hapsederdi.
          this.logger.warn(`iyzico iptali reddetti (${abonelik.providerRef}): ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", abonelik.id)
      .select()
      .single();
    if (error) throw error;
    return mapAbonelik(data);
  }

  /** Kartı değişen abone için iyzico'nun kart güncelleme formunu açar. */
  async kartGuncellemeFormu(userId: string, subscriptionId: string): Promise<{ checkoutFormContent: string }> {
    const abonelik = await this.abonelikBul(subscriptionId);
    if (abonelik.userId !== userId) throw new ForbiddenException("Bu abonelik sana ait değil.");
    if (abonelik.source !== "iyzico" || !abonelik.providerCustomerRef) {
      throw new BadRequestException("Bu abonelik için kart güncellenemiyor.");
    }

    const sonuc = await this.iyzico.kartGuncellemeFormu({
      customerReferenceCode: abonelik.providerCustomerRef,
      subscriptionReferenceCode: abonelik.providerRef,
      callbackUrl: `${getWebAppUrl()}/settings/billing`,
    });
    return { checkoutFormContent: sonuc.checkoutFormContent };
  }

  // ================================================================= Webhook

  /**
   * Sağlayıcıdan gelen olayı kaydeder ve işler.
   *
   * Olay ÖNCE saklanır, sonra işlenir: işleme sırasında bir hata olursa gövde
   * elimizde kalsın ve yeniden işlenebilsin. dedupe_key üzerindeki tekil indeks,
   * aynı olayın tekrar teslimatını veritabanı düzeyinde keser — iyzico 2xx alana
   * kadar 15 dakikada bir yeniden gönderiyor.
   */
  async webhookIsle(params: {
    source: AbonelikKaynagi;
    eventType: string;
    providerRef: string | null;
    dedupeKey: string;
    payload: unknown;
    signatureOk: boolean;
  }): Promise<{ islendi: boolean }> {
    const { error } = await this.supabase.client.from("subscription_events").insert({
      source: params.source,
      event_type: params.eventType,
      provider_ref: params.providerRef,
      dedupe_key: params.dedupeKey,
      payload: params.payload as any,
      signature_ok: params.signatureOk,
    });

    if (error) {
      if ((error as any).code === "23505") {
        this.logger.log(`Yinelenen webhook atlandı (${params.source}/${params.dedupeKey}).`);
        return { islendi: false };
      }
      throw error;
    }

    if (!params.providerRef) return { islendi: false };

    try {
      await this.olayiUygula(params.source, params.eventType, params.providerRef);
      await this.supabase.client
        .from("subscription_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("source", params.source)
        .eq("dedupe_key", params.dedupeKey);
      return { islendi: true };
    } catch (hata) {
      await this.supabase.client
        .from("subscription_events")
        .update({ error: (hata as Error).message })
        .eq("source", params.source)
        .eq("dedupe_key", params.dedupeKey);
      throw hata;
    }
  }

  private async olayiUygula(source: AbonelikKaynagi, eventType: string, providerRef: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("subscriptions")
      .select("*")
      .eq("source", source)
      .eq("provider_ref", providerRef)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Tanımadığımız bir abonelik: ödeme alınmış ama bizde kaydı yok. Olay
      // tabloda duruyor; yönetici elle bağlayabilsin diye hata olarak işaretlenir.
      throw new NotFoundException(`Webhook'taki abonelik bulunamadı: ${providerRef}`);
    }

    const abonelik = mapAbonelik(data);
    const tur = eventType.toLowerCase();

    if (tur.includes("success")) {
      // Yenileme başarılı: dönem ileri alınır ve yeni dönemin kredisi yüklenir.
      const yeniBaslangic = new Date();
      const yeniBitis = ayEkle(yeniBaslangic, periodMonths(abonelik.period));
      const { data: guncel, error: guncelHata } = await this.supabase.client
        .from("subscriptions")
        .update({
          status: "active",
          current_period_start: yeniBaslangic.toISOString(),
          current_period_end: yeniBitis.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", abonelik.id)
        .select()
        .single();
      if (guncelHata) throw guncelHata;
      await this.krediYukle(mapAbonelik(guncel), yeniBaslangic);
      return;
    }

    if (tur.includes("failure") || tur.includes("unpaid")) {
      // Çekim başarısız: sağlayıcı yeniden deneyecek. Erişimi KESMİYORUZ,
      // yalnızca durumu işaretliyoruz (bkz. migration 092 notu).
      await this.supabase.client
        .from("subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .eq("id", abonelik.id)
        .in("status", ["active", "trialing", "past_due"]);
      return;
    }

    if (tur.includes("cancel") || tur.includes("expire")) {
      await this.supabase.client
        .from("subscriptions")
        .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq("id", abonelik.id)
        .in("status", ["active", "trialing", "past_due"]);
    }
  }

  // ============================================================ Dönem işleyici

  /**
   * Günlük bakım: süresi dolmuş abonelikleri kapatır, yıllık abonelerin AYLIK
   * kredisini yükler.
   *
   * Yıllık abone tahsilatı yılda bir yapıyor ama krediyi her ay alıyor (bkz.
   * billing.plans.ts). O yüzden kredi yüklemesi yenileme webhook'una bağlanamaz;
   * ay sınırını burada geçiyoruz.
   */
  async donemleriIlerlet(): Promise<{ krediYuklenen: number; suresiDolan: number }> {
    const simdi = new Date();

    const { data: suresiDolanlar, error: dolanHata } = await this.supabase.client
      .from("subscriptions")
      .update({ status: "expired", updated_at: simdi.toISOString() })
      .in("status", ["canceled", "past_due"])
      .lt("current_period_end", simdi.toISOString())
      .select("id");
    if (dolanHata) throw dolanHata;

    const { data: aktifler, error: aktifHata } = await this.supabase.client
      .from("subscriptions")
      .select("*")
      .in("status", ["active", "trialing"])
      .eq("period", "yearly");
    if (aktifHata) throw aktifHata;

    let krediYuklenen = 0;
    for (const row of aktifler ?? []) {
      const abonelik = mapAbonelik(row);
      if (!abonelik.currentPeriodStart) continue;
      const donemBasi = krediAyiBasi(new Date(abonelik.currentPeriodStart), simdi);
      if (!donemBasi) continue;
      try {
        if (await this.krediYukle(abonelik, donemBasi)) krediYuklenen += 1;
      } catch (error) {
        // Tek bir aboneliğin hatası diğerlerini durdurmasın.
        this.logger.error(`Aylık kredi yüklenemedi (${abonelik.id}): ${(error as Error).message}`);
      }
    }

    return { krediYuklenen, suresiDolan: (suresiDolanlar ?? []).length };
  }

  // ================================================================== Yönetici

  async listele(status: string | undefined, limit: number): Promise<Abonelik[]> {
    let sorgu = this.supabase.client
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) sorgu = sorgu.eq("status", status);
    const { data, error } = await sorgu;
    if (error) throw error;
    return (data ?? []).map(mapAbonelik);
  }

  // ================================================================ Yardımcılar

  private istegiDogrula(istek: { planKey: string; period: string; scope?: string; organizationId?: string }): {
    planKey: PlanKey;
    period: BillingPeriod;
    scope: AbonelikKapsami;
    organizationId?: string;
  } {
    if (!isPlanKey(istek.planKey) || !SATIN_ALINABILIR.includes(istek.planKey)) {
      throw new BadRequestException("Geçersiz paket.");
    }
    if (!isBillingPeriod(istek.period)) throw new BadRequestException("Geçersiz ödeme dönemi.");

    const scope: AbonelikKapsami = istek.scope === "organization" ? "organization" : "user";
    if (scope === "organization" && !istek.organizationId) {
      throw new BadRequestException("Şirket aboneliği için şirket seçilmeli.");
    }
    return { planKey: istek.planKey, period: istek.period, scope, organizationId: istek.organizationId };
  }

  /** Şirket aboneliğini yalnızca şirket sahibi alabilir — fatura sahibi o olacak. */
  private async organizasyonSahibiMi(userId: string, organizationId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Şirket bulunamadı.");
    if (data.owner_id !== userId) {
      throw new ForbiddenException("Şirket aboneliğini yalnızca şirket sahibi satın alabilir.");
    }
  }

  private async abonelikBul(id: string): Promise<Abonelik> {
    const { data, error } = await this.supabase.client.from("subscriptions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Abonelik bulunamadı.");
    return mapAbonelik(data);
  }

  private async kullaniciBilgisi(userId: string): Promise<{
    ad: string;
    soyad: string;
    email: string;
    telefon?: string;
    adres?: string;
  }> {
    const { data, error } = await this.supabase.client
      .from("users")
      .select("full_name, email, phone")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kullanıcı bulunamadı.");

    const parcalar = String(data.full_name ?? "").trim().split(/\s+/);
    // iyzico ad ve soyadı AYRI istiyor ve ikisi de boş olamaz; tek kelimelik
    // isimlerde soyad alanına adı tekrar yazıyoruz (reddedilmesin diye).
    const ad = parcalar[0] || "Projelio";
    const soyad = parcalar.length > 1 ? parcalar.slice(1).join(" ") : ad;
    return { ad, soyad, email: String(data.email ?? ""), telefon: data.phone ?? undefined };
  }

  /** conversationId'yi geri çözer (bkz. checkoutBaslat). */
  private conversationCoz(conversationId: string): {
    userId: string;
    scope: AbonelikKapsami;
    organizationId?: string;
    planKey: PlanKey;
    period: BillingPeriod;
  } | null {
    const parcalar = conversationId.split(":");
    if (parcalar.length < 5) return null;
    const [userId, scope, organizationId, planKey, period] = parcalar;
    if (!userId || !isPlanKey(planKey) || !isBillingPeriod(period)) return null;
    if (scope !== "user" && scope !== "organization") return null;
    return {
      userId,
      scope,
      organizationId: organizationId && organizationId !== "-" ? organizationId : undefined,
      planKey,
      period,
    };
  }

  private tariheCevir(deger: unknown): Date | null {
    if (!deger) return null;
    const tarih = typeof deger === "number" ? new Date(deger) : new Date(String(deger));
    return Number.isNaN(tarih.getTime()) ? null : tarih;
  }

  private callbackTabani(): string {
    return (process.env.BACKEND_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  }
}
