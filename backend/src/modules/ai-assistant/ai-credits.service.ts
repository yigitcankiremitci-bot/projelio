import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import {
  calculateUsageCost,
  COMMISSION_RATE,
  CREDIT_UNIT_USD,
  MIN_BALANCE_TO_START,
  WELCOME_CREDITS,
} from "./ai-credits.config";

/**
 * Bakiye yetersizliğini HTTP 402 (Payment Required) ile bildirir; istemci bu kodu
 * görünce "kredi yükle" akışını açar. NestJS'in hazır bir 402 sınıfı yoktur.
 */
export class InsufficientCreditsException extends HttpException {
  constructor(message: string) {
    super({ statusCode: HttpStatus.PAYMENT_REQUIRED, message, error: "InsufficientCredits" }, HttpStatus.PAYMENT_REQUIRED);
  }
}

export interface CreditBalance {
  balance: number;
  lifetimePurchased: number;
  lifetimeSpent: number;
}

export interface CreditTransaction {
  id: string;
  type: "topup" | "usage" | "refund" | "adjustment" | "welcome";
  credits: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

function mapTransaction(row: any): CreditTransaction {
  return {
    id: row.id,
    type: row.type,
    credits: Number(row.credits),
    balanceAfter: Number(row.balance_after),
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

/** Anthropic'in Cost Report API'sinden okunan ömür boyu maliyetin bellek içi önbelleği. */
interface RealCostCacheEntry {
  value: number;
  fetchedAt: number;
}

/**
 * Admin paneli her açıldığında/yenilendiğinde bu endpoint'e istek gitmesin diye
 * ("polling once per minute for sustained use" — Anthropic'in kendi önerisi) taze
 * bir önbellek tutulur. Taze önbellek yoksa ama az önce başarılı bir sonuç alındıysa,
 * yeni istek 429 (hız sınırı) ile başarısız olduğunda o eski sonuca (biraz daha uzun
 * bir süre için) düşülür — böylece geçici bir hız sınırı "kendi tahminimize" gürültülü
 * bir şekilde geri dönmeye sebep olmaz.
 */
const REAL_COST_FRESH_TTL_MS = 5 * 60_000;
const REAL_COST_STALE_FALLBACK_MS = 30 * 60_000;
/**
 * 429 (hız sınırı) alındığında bu süre boyunca Anthropic'e hiç istek atılmaz —
 * yeni/dönüştürülmüş organizasyonlarda Cost Report API'nin izin verdiği hız çok
 * düşük olabiliyor; art arda denemek sadece logu doldurup hesabı daha da
 * "şüpheli" gösterir. Bekleme süresi dolunca tek bir deneme daha yapılır.
 */
const REAL_COST_COOLDOWN_AFTER_429_MS = 10 * 60_000;

@Injectable()
export class AiCreditsService {
  private readonly logger = new Logger(AiCreditsService.name);
  private realCostCache: RealCostCacheEntry | null = null;
  private realCostBlockedUntil = 0;

  constructor(private supabase: SupabaseService) {}

  /**
   * Kullanıcının bakiyesini döner. Kayıt yoksa oluşturur ve (tanımlıysa) hoş geldin
   * kredisini bir defaya mahsus tanımlar.
   */
  async getBalance(userId: string): Promise<CreditBalance> {
    const { data, error } = await this.supabase.client
      .from("ai_credit_balances")
      .select("balance, lifetime_purchased, lifetime_spent")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      if (WELCOME_CREDITS > 0) {
        await this.grant(userId, WELCOME_CREDITS, "welcome", "Hoş geldin kredisi");
        return { balance: WELCOME_CREDITS, lifetimePurchased: WELCOME_CREDITS, lifetimeSpent: 0 };
      }
      await this.supabase.client.from("ai_credit_balances").insert({ user_id: userId });
      return { balance: 0, lifetimePurchased: 0, lifetimeSpent: 0 };
    }

    return {
      balance: Number(data.balance),
      lifetimePurchased: Number(data.lifetime_purchased),
      lifetimeSpent: Number(data.lifetime_spent),
    };
  }

  /** Yeni bir isteğe başlamadan önce yeterli bakiye var mı? */
  async assertCanStart(userId: string): Promise<void> {
    const { balance } = await this.getBalance(userId);
    if (balance < MIN_BALANCE_TO_START) {
      throw new InsufficientCreditsException(
        `AI kredin yetersiz (${balance.toFixed(0)} kredi). Devam etmek için kredi yüklemen gerekiyor.`
      );
    }
  }

  /** Bakiye ekler (yükleme / hoş geldin / iade / düzeltme). */
  async grant(
    userId: string,
    credits: number,
    type: "topup" | "welcome" | "refund" | "adjustment",
    description?: string,
    createdBy?: string
  ): Promise<CreditBalance> {
    if (!Number.isFinite(credits) || credits <= 0) {
      throw new BadRequestException("Kredi miktarı pozitif bir sayı olmalı.");
    }

    const balanceAfter = await this.applyChange(userId, credits, true);
    await this.supabase.client.from("ai_credit_transactions").insert({
      user_id: userId,
      type,
      credits,
      balance_after: balanceAfter,
      description: description ?? null,
      created_by: createdBy ?? null,
    });

    return this.getBalance(userId);
  }

  /**
   * Bir AI turunda harcanan token'ları krediye çevirip bakiyeden düşer.
   *
   * Not: Düşüm, iş tamamlandıktan SONRA yapılır ve bakiyenin eksiye düşmesine izin
   * verilir (allowNegative). Böylece kullanıcının yaptığı işlem yarıda kesilmez;
   * bir sonraki istek assertCanStart ile zaten engellenir. Bu, küçük bir taşma
   * riskini kabul edip veri tutarlılığını korumayı tercih eden bilinçli bir seçimdir.
   */
  async chargeUsage(params: {
    userId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
    conversationId?: string;
  }): Promise<{ credits: number; balanceAfter: number }> {
    const { userId, model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, conversationId } = params;
    const { costUsd, chargedUsd, credits } = calculateUsageCost(model, {
      inputTokens,
      outputTokens,
      cacheWriteTokens,
      cacheReadTokens,
    });

    if (credits <= 0) return { credits: 0, balanceAfter: (await this.getBalance(userId)).balance };

    const balanceAfter = await this.applyChange(userId, -credits, true);

    const { error } = await this.supabase.client.from("ai_credit_transactions").insert({
      user_id: userId,
      type: "usage",
      credits: -credits,
      balance_after: balanceAfter,
      description: "AI asistan kullanımı",
      conversation_id: conversationId ?? null,
      model,
      // Denetlenebilirlik için tüm girdi token'ları (önbellek dahil) tek alanda toplanır.
      input_tokens: inputTokens + (cacheWriteTokens ?? 0) + (cacheReadTokens ?? 0),
      output_tokens: outputTokens,
      cost_usd: costUsd,
      charged_usd: chargedUsd,
    });
    if (error) this.logger.error(`Kredi hareketi kaydedilemedi: ${error.message}`);

    return { credits, balanceAfter };
  }

  async listTransactions(userId: string, limit = 50): Promise<CreditTransaction[]> {
    const { data, error } = await this.supabase.client
      .from("ai_credit_transactions")
      .select("id, type, credits, balance_after, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  /**
   * Admin paneli için: her kullanıcının AI kredi bakiyesini tek listede döner.
   * Henüz hiç AI kullanmamış kullanıcıların bakiye satırı olmayabilir (satır ilk
   * `getBalance` çağrısında lazy oluşturulur) — bu yüzden users tablosundan başlayıp
   * bakiyeyi LEFT JOIN gibi eşleriz; satırı yoksa 0 gösteririz.
   */
  async listAllBalances(): Promise<
    {
      userId: string;
      fullName: string;
      username: string;
      email: string;
      balance: number;
      lifetimePurchased: number;
      lifetimeSpent: number;
    }[]
  > {
    const [usersResult, balancesResult] = await Promise.all([
      this.supabase.client.from("users").select("id, full_name, username, email").order("full_name"),
      this.supabase.client.from("ai_credit_balances").select("user_id, balance, lifetime_purchased, lifetime_spent"),
    ]);
    if (usersResult.error) throw usersResult.error;
    if (balancesResult.error) throw balancesResult.error;

    const balanceByUser = new Map((balancesResult.data ?? []).map((r: any) => [r.user_id, r]));

    return (usersResult.data ?? []).map((u: any) => {
      const b = balanceByUser.get(u.id);
      return {
        userId: u.id,
        fullName: u.full_name,
        username: u.username,
        email: u.email,
        balance: Number(b?.balance ?? 0),
        lifetimePurchased: Number(b?.lifetime_purchased ?? 0),
        lifetimeSpent: Number(b?.lifetime_spent ?? 0),
      };
    });
  }

  /**
   * Admin, Anthropic konsolunda (console.anthropic.com) hesaba gerçek para yüklediğinde
   * bunu buraya kaydeder. Anthropic'in bakiyeyi okuyabileceğimiz bir API'si yok; bu yüzden
   * "kalan bakiye" burada yüklenen tutarlar ile şimdiye kadarki gerçek Anthropic maliyeti
   * (ai_credit_transactions.cost_usd, komisyonsuz) karşılaştırılarak hesaplanır.
   */
  async topUpProviderBalance(amountUsd: number, description: string | undefined, createdBy: string): Promise<void> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new BadRequestException("Yüklenen tutar pozitif bir sayı olmalı.");
    }
    const { error } = await this.supabase.client.from("ai_provider_balance_topups").insert({
      amount_usd: amountUsd,
      description: description ?? null,
      created_by: createdBy,
    });
    if (error) throw error;
  }

  /**
   * Anthropic'in resmi "Cost Report" Admin API'sinden (https://api.anthropic.com/v1/organizations/cost_report)
   * ömür boyu GERÇEK maliyeti çeker. Bu bizim kendi token sayımımıza değil, doğrudan
   * Anthropic'in faturalandırdığı rakama dayanır — yani en doğru kaynaktır.
   *
   * Ayrı bir "Admin API key" gerektirir (backend/.env → ANTHROPIC_ADMIN_API_KEY=sk-ant-admin01-...),
   * normal ANTHROPIC_API_KEY'den farklıdır ve Anthropic Console'da organizasyon
   * admin/owner yetkisiyle oluşturulur. Anahtar yoksa veya istek başarısız olursa null
   * döner ve çağıran taraf kendi tahminine (ai_credit_transactions.cost_usd) düşer —
   * bu yüzden özellik kapalıyken hiçbir şey bozulmaz.
   */
  /**
   * sanityCeilingUsd: kendi token bazlı tahminimizin (internalEstimateUsd) çok üzerinde
   * bir rakam gelirse (ör. birim/kümülatif hesap hatası), bunu SESSİZCE göstermek yerine
   * reddedip loglarız — yanlış ama "resmi" görünen bir rakamı admin'e göstermek, kendi
   * tahminimizi göstermekten daha kötüdür. Marj: gerçek fiyatlandırma bizim tablomuzdan
   * biraz farklı olabilir diye ×5 + 0,50 tampon bırakılır.
   */
  private async fetchAnthropicRealCostUsd(sinceIso: string, sanityCeilingUsd: number): Promise<number | null> {
    const adminKey = process.env.ANTHROPIC_ADMIN_API_KEY?.trim();
    if (!adminKey) return null;

    const now = Date.now();
    if (this.realCostCache && now - this.realCostCache.fetchedAt < REAL_COST_FRESH_TTL_MS) {
      return this.realCostCache.value;
    }
    if (now < this.realCostBlockedUntil) {
      // Az önce 429 aldık; bekleme süresi dolmadan tekrar denemiyoruz — elimizdeki
      // en son (varsa bayat) sonuca düşülür.
      if (this.realCostCache && now - this.realCostCache.fetchedAt < REAL_COST_STALE_FALLBACK_MS) {
        return this.realCostCache.value;
      }
      return null;
    }

    try {
      let total = 0;
      let page: string | undefined;
      let bucketCount = 0;
      let resultCount = 0;
      const sampleResults: any[] = [];
      // ending_at döngü boyunca SABİT tutulur: her sayfada yeniden hesaplanırsa
      // (ör. Date.now()), sayfalar arası pencere kayar ve next_page imleciyle
      // tutarsızlık/çift sayım riski oluşur.
      const endingAtIso = new Date().toISOString();
      // Güvenlik: API bir sebeple sürekli has_more=true dönerse sonsuz döngüye
      // girmeyelim diye sayfa sayısı sınırlanır (günlük bucket ile bu kadar sayfa
      // pratikte yıllarca veriye karşılık gelir).
      for (let i = 0; i < 50; i++) {
        // Sayfalar arasında kısa bir bekleme: bu endpoint dakikada bir sorgulanacak
        // şekilde tasarlanmış, art arda aralıksız istek yeni/düşük limitli admin
        // key'lerde hız sınırına çarpıyordu.
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 400));

        const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
        url.searchParams.set("starting_at", sinceIso);
        url.searchParams.set("ending_at", endingAtIso);
        url.searchParams.set("limit", "31");
        if (page) url.searchParams.set("page", page);

        const res = await fetch(url, {
          headers: {
            "x-api-key": adminKey,
            "anthropic-version": "2023-06-01",
          },
        });
        if (!res.ok) {
          this.logger.warn(`Anthropic cost_report isteği başarısız (${res.status}): ${await res.text()}`);
          if (res.status === 429) {
            this.realCostBlockedUntil = now + REAL_COST_COOLDOWN_AFTER_429_MS;
          }
          // Elimizde az önce alınmış bir sonuç varsa (30 dk'ya kadar) ona düş;
          // yoksa null dönüp çağıran taraf kendi tahminini kullansın.
          if (this.realCostCache && now - this.realCostCache.fetchedAt < REAL_COST_STALE_FALLBACK_MS) {
            return this.realCostCache.value;
          }
          return null;
        }
        const body: any = await res.json();
        for (const bucket of body.data ?? []) {
          bucketCount++;
          for (const result of bucket.results ?? []) {
            resultCount++;
            if (sampleResults.length < 12) sampleResults.push(result);
            total += Number(result.amount ?? 0);
          }
        }
        if (!body.has_more || !body.next_page) break;
        page = body.next_page;
      }

      // Teşhis: Console'daki gerçek rakamla karşılaştırabilmek için ham dökümü logla.
      this.logger.log(
        `Anthropic cost_report ham sonuç: bucket=${bucketCount} result=${resultCount} toplam=${total} ` +
          `aralık=[${sinceIso} .. ${endingAtIso}] örnekler=${JSON.stringify(sampleResults)}`
      );

      if (total > sanityCeilingUsd) {
        this.logger.warn(
          `Anthropic cost_report şüpheli: toplam=${total} kendi tahminimizin (${sanityCeilingUsd} tavan) çok üzerinde. ` +
            `Bu sonucu REDDEDİP kendi tahminimize düşülüyor — bkz. yukarıdaki ham döküm.`
        );
        // Şüpheli sonucu önbelleğe YAZMIYORUZ ki bir dahaki temiz denemede tekrar hesaplansın.
        return null;
      }

      this.realCostCache = { value: total, fetchedAt: now };
      return total;
    } catch (err: any) {
      this.logger.warn(`Anthropic cost_report çağrısı başarısız: ${err?.message ?? err}`);
      if (this.realCostCache && now - this.realCostCache.fetchedAt < REAL_COST_STALE_FALLBACK_MS) {
        return this.realCostCache.value;
      }
      return null;
    }
  }

  /**
   * Admin, Anthropic Console'ın Cost sayfasında gördüğü gerçek ömür boyu maliyeti
   * bir "referans noktası" (checkpoint) olarak kaydeder. getProviderBalanceStatus bu
   * noktayı bulursa, o andan SONRAKİ kullanımı kendi tahminimizle üstüne ekleyip
   * gösterir — Cost Report API'si (bkz. fetchAnthropicRealCostUsd) güvenilir hale
   * gelene kadar en tutarlı yöntem budur.
   */
  async recordCostCheckpoint(amountUsd: number, description: string | undefined, createdBy: string): Promise<void> {
    if (!Number.isFinite(amountUsd) || amountUsd < 0) {
      throw new BadRequestException("Tutar 0 veya pozitif bir sayı olmalı.");
    }
    const { error } = await this.supabase.client.from("ai_provider_cost_checkpoints").insert({
      amount_usd: amountUsd,
      description: description ?? null,
      created_by: createdBy,
    });
    if (error) throw error;
  }

  /**
   * Projelio'nun Anthropic hesabında ne kadar bakiye kaldığının tahmini.
   *
   * spentUsd üç kaynaktan biriyle belirlenir, öncelik sırasıyla:
   *  1. "manual_checkpoint" — admin'in Console'dan elle girdiği son referans noktası +
   *     o noktadan sonraki kullanımın kendi tahminimiz kadarı. En güvenilir kaynak,
   *     çünkü bir insan gerçek Console rakamını doğrulamış.
   *  2. "anthropic_api" — Cost Report API'sinden canlı çekilen, kendi tahminimize göre
   *     mantıksız derecede yüksek OLMAYAN sonuç.
   *  3. "internal_estimate" — hiçbiri yoksa/başarısızsa kendi token bazlı tahminimiz.
   * internalEstimateUsd her zaman (checkpoint sonrası delta için de) hesaplanıp dönülür.
   *
   * remainingCredits hesabında dikkat edilmesi gereken nokta: remainingUsd, Anthropic'e
   * ödenen HAM maliyet (komisyonsuz) üzerinden hesaplanır; CREDIT_UNIT_USD ise kullanıcıya
   * SATILAN kredinin birim fiyatıdır (komisyon dahil). İkisini doğrudan bölmek kalan
   * kapasiteyi ~%20 düşük gösterir. Doğru çevrim: ham USD'yi önce satış bedeline
   * (× (1+komisyon)) çevirip sonra kredi birimine bölmek.
   */
  async getProviderBalanceStatus(): Promise<{
    toppedUpUsd: number;
    spentUsd: number;
    spentUsdSource: "manual_checkpoint" | "anthropic_api" | "internal_estimate";
    internalEstimateUsd: number;
    remainingUsd: number;
    remainingCredits: number;
    lastTopups: { amountUsd: number; description?: string; createdAt: string }[];
    lastCheckpoint?: { amountUsd: number; createdAt: string };
  }> {
    const [topupsResult, usageResult, checkpointResult] = await Promise.all([
      this.supabase.client
        .from("ai_provider_balance_topups")
        .select("amount_usd, description, created_at")
        .order("created_at", { ascending: false }),
      this.supabase.client.from("ai_credit_transactions").select("cost_usd, created_at").eq("type", "usage"),
      this.supabase.client
        .from("ai_provider_cost_checkpoints")
        .select("amount_usd, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (topupsResult.error) throw topupsResult.error;
    if (usageResult.error) throw usageResult.error;
    if (checkpointResult.error) throw checkpointResult.error;

    const topups = topupsResult.data ?? [];
    const usageRows = usageResult.data ?? [];
    const checkpoint = checkpointResult.data as { amount_usd: number; created_at: string } | null;
    const toppedUpUsd = topups.reduce((sum, r: any) => sum + Number(r.amount_usd ?? 0), 0);
    const internalEstimateUsd = usageRows.reduce((sum, r: any) => sum + Number(r.cost_usd ?? 0), 0);

    let spentUsd: number;
    let spentUsdSource: "manual_checkpoint" | "anthropic_api" | "internal_estimate";

    if (checkpoint) {
      const checkpointAt = new Date(checkpoint.created_at).getTime();
      const deltaSinceCheckpoint = usageRows
        .filter((r: any) => new Date(r.created_at).getTime() > checkpointAt)
        .reduce((sum, r: any) => sum + Number(r.cost_usd ?? 0), 0);
      spentUsd = Number(checkpoint.amount_usd) + deltaSinceCheckpoint;
      spentUsdSource = "manual_checkpoint";
    } else {
      // Anthropic'e SADECE gerçekten veri olabilecek tarihten itibaren sorulur — geniş
      // (ör. 1 yıllık) bir aralık, çok fazla günlük bucket'ı art arda, aralıksız sayfalayıp
      // yeni admin key'lerin düşük hız sınırına çarpmamıza sebep oluyordu (bkz. gözlenen
      // 429'lar). En eski kayıt, en eski kullanım ya da en eski yükleme tarihinden hangisi
      // daha eskiyse odur; hiçbiri yoksa 30 gün öncesi kullanılır (zaten maliyet 0 olacak).
      const allDates = [...usageRows.map((r: any) => r.created_at), ...topups.map((r: any) => r.created_at)].filter(
        Boolean
      );
      const earliestIso =
        allDates.length > 0
          ? new Date(Math.min(...allDates.map((d: string) => new Date(d).getTime()))).toISOString()
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sanityCeilingUsd = Math.max(internalEstimateUsd * 5 + 0.5, 2);
      const realCostUsd = await this.fetchAnthropicRealCostUsd(earliestIso, sanityCeilingUsd);
      spentUsd = realCostUsd ?? internalEstimateUsd;
      spentUsdSource = realCostUsd !== null ? "anthropic_api" : "internal_estimate";
    }

    const remainingUsd = toppedUpUsd - spentUsd;

    return {
      toppedUpUsd: Number(toppedUpUsd.toFixed(2)),
      spentUsd: Number(spentUsd.toFixed(4)),
      spentUsdSource,
      internalEstimateUsd: Number(internalEstimateUsd.toFixed(4)),
      remainingUsd: Number(remainingUsd.toFixed(4)),
      lastCheckpoint: checkpoint ? { amountUsd: Number(checkpoint.amount_usd), createdAt: checkpoint.created_at } : undefined,
      remainingCredits: Math.round((remainingUsd * (1 + COMMISSION_RATE)) / CREDIT_UNIT_USD),
      lastTopups: topups.slice(0, 10).map((r: any) => ({
        amountUsd: Number(r.amount_usd),
        description: r.description ?? undefined,
        createdAt: r.created_at,
      })),
    };
  }

  /** Projelio'nun marj raporu: ham maliyet, satış bedeli ve kâr (admin için). */
  async getMarginReport(days = 30): Promise<Record<string, unknown>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase.client
      .from("ai_credit_transactions")
      .select("cost_usd, charged_usd, credits, input_tokens, output_tokens")
      .eq("type", "usage")
      .gte("created_at", since);
    if (error) throw error;

    const rows = data ?? [];
    const costUsd = rows.reduce((sum, r: any) => sum + Number(r.cost_usd ?? 0), 0);
    const chargedUsd = rows.reduce((sum, r: any) => sum + Number(r.charged_usd ?? 0), 0);
    const count = rows.length;

    return {
      days,
      requestCount: count,
      totalInputTokens: rows.reduce((s, r: any) => s + Number(r.input_tokens ?? 0), 0),
      totalOutputTokens: rows.reduce((s, r: any) => s + Number(r.output_tokens ?? 0), 0),
      creditsSpent: Number(rows.reduce((s, r: any) => s + Math.abs(Number(r.credits ?? 0)), 0).toFixed(2)),
      anthropicCostUsd: Number(costUsd.toFixed(4)),
      userChargedUsd: Number(chargedUsd.toFixed(4)),
      grossProfitUsd: Number((chargedUsd - costUsd).toFixed(4)),
      // İstek başına ortalama maliyet: bu rakam tırmanıyorsa promptlar/araç sonuçları
      // şişiyor demektir. Anthropic konsolundaki tutarla karşılaştırmak için kullanın.
      avgCostPerRequestUsd: count ? Number((costUsd / count).toFixed(5)) : 0,
      avgCreditsPerRequest: count
        ? Number((rows.reduce((s, r: any) => s + Math.abs(Number(r.credits ?? 0)), 0) / count).toFixed(1))
        : 0,
      commissionRate: COMMISSION_RATE,
    };
  }

  /** Atomik bakiye değişimi (Postgres tarafında satır kilidiyle). */
  private async applyChange(userId: string, credits: number, allowNegative: boolean): Promise<number> {
    const { data, error } = await this.supabase.client.rpc("ai_apply_credit_change", {
      p_user_id: userId,
      p_credits: credits,
      p_allow_negative: allowNegative,
    });
    if (error) {
      if (error.message?.includes("INSUFFICIENT_CREDITS")) {
        throw new InsufficientCreditsException("AI kredin yetersiz. Devam etmek için kredi yüklemen gerekiyor.");
      }
      throw error;
    }
    return Number(data);
  }
}
