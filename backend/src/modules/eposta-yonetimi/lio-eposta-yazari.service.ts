import { Injectable, Logger } from "@nestjs/common";
import { isLocale } from "@projelio/shared";
import type { Locale } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { LlmProviderRegistry } from "../ai-assistant/providers/provider-registry";
import { calculateUsageCost } from "../ai-assistant/ai-credits.config";
import type { HazirMetin } from "../notifications/ipucu-eposta.template";
import {
  kisisellestirmeIstemi,
  lioMetniniCoz,
  taslakIstemi,
  type LioAliciBaglami,
  type Taslak,
} from "./lio-eposta";

/**
 * Lio'ya e-posta yazdırır ve harcamayı AYRI bir deftere yazar (bkz. migration
 * 119, eposta_ai_kullanimi).
 *
 * KİMSENİN BAKİYESİNDEN KESİLMİYOR: bu e-postaları kullanıcı istemedi,
 * işletme gönderiyor. Ama bedeli görünmez de olmamalı — defterde her çağrı,
 * bir kullanıcıdan kesilseydi kaç birim tutacağıyla (komisyon dahil) duruyor;
 * admin panelinin "E-posta maliyeti" sekmesi buradan okuyor.
 *
 * Kişiselleştirme HATA FIRLATMAZ, null döner: model düştüğünde kampanya
 * durmamalı, alıcı taslağın kendisini alır. Taslak yazdırma ise yöneticinin
 * bilerek istediği bir iş — orada hata yöneticiye gösterilir.
 */

export type LioIslemi = "ipucu" | "kampanya" | "taslak" | "onizleme";

/** Kişiselleştirilmiş metin kısa; geniş tavan yalnızca para harcatır. */
const KISISELLESTIRME_TOKEN = 900;
const TASLAK_TOKEN = 1200;

@Injectable()
export class LioEpostaYazariService {
  private readonly logger = new Logger(LioEpostaYazariService.name);

  constructor(
    private supabase: SupabaseService,
    private providers: LlmProviderRegistry
  ) {}

  /** Sunucuda metin üretebilecek bir sağlayıcı var mı (arayüz düğmeyi kapatsın diye). */
  kullanilabilir(): boolean {
    return this.providers.primaryForTier("fast") !== null;
  }

  /**
   * Taslağı tek bir alıcı için yeniden yazar. Başarısızlıkta null — çağıran
   * taslağın kendisini gönderir.
   */
  async kisisellestir(params: {
    taslak: Taslak;
    aliciId: string;
    islem: LioIslemi;
    kampanyaId?: string;
    ipucuAnahtari?: string;
    adminId?: string;
  }): Promise<{ metin: HazirMetin; birim: number } | null> {
    try {
      const baglam = await this.aliciBaglami(params.aliciId);
      const istem = kisisellestirmeIstemi(params.taslak, baglam);
      const { metin, birim } = await this.yaz("fast", istem, KISISELLESTIRME_TOKEN, {
        islem: params.islem,
        kampanyaId: params.kampanyaId,
        ipucuAnahtari: params.ipucuAnahtari,
        aliciId: params.aliciId,
        adminId: params.adminId,
      });
      return { metin, birim };
    } catch (err) {
      this.logger.warn(
        `Lio e-postayı kişiselleştiremedi (${params.islem}, alıcı ${params.aliciId}): ${err instanceof Error ? err.message : err}`
      );
      return null;
    }
  }

  /** Yöneticinin isteğinden taslak. Hata yöneticiye gider. */
  async taslakYaz(istek: string, dil: Locale, adminId: string): Promise<{ metin: HazirMetin; birim: number }> {
    return this.yaz("smart", taslakIstemi(istek, dil), TASLAK_TOKEN, { islem: "taslak", adminId });
  }

  /** Bugün (UTC) belirli bir işlemde harcanan birim — otomatik ipucu tavanı için. */
  async bugunkuHarcama(islem: LioIslemi): Promise<number> {
    const gunBasi = new Date();
    gunBasi.setUTCHours(0, 0, 0, 0);
    const { data, error } = await this.supabase.client
      .from("eposta_ai_kullanimi")
      .select("birim")
      .eq("islem", islem)
      .gte("created_at", gunBasi.toISOString())
      .limit(10000);
    if (error) throw error;
    return (data ?? []).reduce((t: number, r: any) => t + Number(r.birim || 0), 0);
  }

  private async yaz(
    kademe: "fast" | "smart",
    istem: { system: string; user: string },
    maxTokens: number,
    kayit: { islem: LioIslemi; kampanyaId?: string; ipucuAnahtari?: string; aliciId?: string; adminId?: string }
  ): Promise<{ metin: HazirMetin; birim: number }> {
    const { response, choice } = await this.providers.send(kademe, (secim) => ({
      model: secim.model,
      max_tokens: maxTokens,
      system: istem.system,
      messages: [{ role: "user", content: istem.user }],
    }));
    const yanit = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    // Maliyet, yanıt çözülemese bile yazılır: sağlayıcı isteği işledi ve
    // bedeli bize yazdı. Defter gerçeği göstermeli.
    const { costUsd, credits } = calculateUsageCost(choice.model, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheWriteTokens: response.usage.cache_creation_input_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens,
    });
    let metin: HazirMetin | null = null;
    let hata: unknown = null;
    try {
      metin = lioMetniniCoz(yanit);
    } catch (err) {
      hata = err;
    }
    await this.defteriYaz({
      ...kayit,
      model: choice.model,
      inputTokens:
        response.usage.input_tokens +
        (response.usage.cache_creation_input_tokens ?? 0) +
        (response.usage.cache_read_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
      costUsd,
      birim: credits,
      basarili: metin !== null,
    });
    if (!metin) throw hata instanceof Error ? hata : new Error("Lio yanıtı çözülemedi");
    return { metin, birim: credits };
  }

  /** Defter kaydı düşerse e-posta yine gider; kayıp yalnızca loglanır. */
  private async defteriYaz(k: {
    islem: LioIslemi;
    kampanyaId?: string;
    ipucuAnahtari?: string;
    aliciId?: string;
    adminId?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    birim: number;
    basarili: boolean;
  }): Promise<void> {
    const { error } = await this.supabase.client.from("eposta_ai_kullanimi").insert({
      islem: k.islem,
      kampanya_id: k.kampanyaId ?? null,
      ipucu_anahtari: k.ipucuAnahtari ?? null,
      alici_user_id: k.aliciId ?? null,
      admin_user_id: k.adminId ?? null,
      model: k.model,
      input_tokens: k.inputTokens,
      output_tokens: k.outputTokens,
      maliyet_usd: k.costUsd,
      birim: k.birim,
      basarili: k.basarili,
    });
    if (error) this.logger.error(`E-posta Lio harcaması deftere yazılamadı: ${error.message}`);
  }

  /**
   * Modele gidecek alıcı bilgisi — bilerek az (bkz. lio-eposta.ts başlığı).
   * Sayıların her biri ayrı ve hataya dayanıklı: biri okunamazsa metin yine
   * yazılır, yalnızca o bilgi eksik kalır.
   */
  private async aliciBaglami(userId: string): Promise<LioAliciBaglami> {
    const [kullanici, isler, gorevler, etkinlik] = await Promise.all([
      this.supabase.client
        .from("users")
        .select("full_name, locale, account_type, sector, created_at")
        .eq("id", userId)
        .maybeSingle(),
      this.supabase.client
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("is_sample", false),
      this.supabase.client
        .from("task_assignees")
        .select("task_id", { count: "exact", head: true })
        .eq("user_id", userId),
      this.supabase.client.from("user_activity_state").select("last_seen_at").eq("user_id", userId).maybeSingle(),
    ]);
    const u: any = kullanici.data ?? {};
    const gunOnce = (deger: unknown): number | null => {
      if (typeof deger !== "string") return null;
      const an = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(deger) ? deger : `${deger}Z`);
      return Number.isNaN(an.getTime()) ? null : Math.max(0, Math.floor((Date.now() - an.getTime()) / 86_400_000));
    };
    return {
      ad: typeof u.full_name === "string" && u.full_name.trim() ? u.full_name.trim() : undefined,
      dil: isLocale(u.locale) ? u.locale : "tr",
      hesapTipi: u.account_type ?? null,
      sektor: u.sector ?? null,
      uyelikGun: gunOnce(u.created_at),
      isSayisi: isler.error ? null : (isler.count ?? null),
      gorevSayisi: gorevler.error ? null : (gorevler.count ?? null),
      sonGirisGunOnce: etkinlik.error ? null : gunOnce((etkinlik.data as any)?.last_seen_at),
    };
  }
}
