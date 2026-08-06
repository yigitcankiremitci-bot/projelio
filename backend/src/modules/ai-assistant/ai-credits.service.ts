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

@Injectable()
export class AiCreditsService {
  private readonly logger = new Logger(AiCreditsService.name);

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
   * Projelio'nun Anthropic hesabında ne kadar bakiye kaldığının tahmini.
   * remainingCredits: aynı tahmini, kullanıcıya kredi yüklerken girilen birimle (kredi)
   * karşılaştırılabilsin diye CREDIT_UNIT_USD ile çevrilmiş hâli — admin "bu kullanıcıya
   * 5000 kredi versem elimde ne kalır" sorusunu buradan cevaplayabilir.
   */
  async getProviderBalanceStatus(): Promise<{
    toppedUpUsd: number;
    spentUsd: number;
    remainingUsd: number;
    remainingCredits: number;
    lastTopups: { amountUsd: number; description?: string; createdAt: string }[];
  }> {
    const [topupsResult, usageResult] = await Promise.all([
      this.supabase.client
        .from("ai_provider_balance_topups")
        .select("amount_usd, description, created_at")
        .order("created_at", { ascending: false }),
      this.supabase.client.from("ai_credit_transactions").select("cost_usd").eq("type", "usage"),
    ]);
    if (topupsResult.error) throw topupsResult.error;
    if (usageResult.error) throw usageResult.error;

    const topups = topupsResult.data ?? [];
    const toppedUpUsd = topups.reduce((sum, r: any) => sum + Number(r.amount_usd ?? 0), 0);
    const spentUsd = (usageResult.data ?? []).reduce((sum, r: any) => sum + Number(r.cost_usd ?? 0), 0);
    const remainingUsd = toppedUpUsd - spentUsd;

    return {
      toppedUpUsd: Number(toppedUpUsd.toFixed(2)),
      spentUsd: Number(spentUsd.toFixed(4)),
      remainingUsd: Number(remainingUsd.toFixed(4)),
      remainingCredits: Math.round(remainingUsd / CREDIT_UNIT_USD),
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
