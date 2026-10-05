import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type Anthropic from "@anthropic-ai/sdk";
import type { SocialDiscovery } from "@projelio/shared";
import { icerikTuru, normalizeSocialHandle, performanslar } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AiCreditsService } from "../ai-assistant/ai-credits.service";
import { calculateUsageCost } from "../ai-assistant/ai-credits.config";
import type { LlmResponse } from "../ai-assistant/providers/llm-provider";
import { LlmProviderRegistry } from "../ai-assistant/providers/provider-registry";
import {
  gorulenAdresler,
  kesfiCoz,
  KesifOkunamadi,
  kesifIstemi,
  kesifSistemi,
  MAX_ARAMA,
  sonMetin,
} from "./benzer-hesap";
import { IcerikAnaliziService, kapsamSutunlari, kesfeCevir } from "./icerik-analizi.service";
import { SocialMediaService, type SocialScope } from "./social-media.service";

/**
 * Başlamadan önceki bakiye kontrolü için token tahmini.
 *
 * Her arama sonucu modele ~11 bin token girdi olarak dönüyor (2026-10-05'te
 * ölçüldü: tek arama = 11.209 girdi token'ı). En fazla 5 arama + istem ≈ 60
 * bin girdi; çıktı JSON + düşünme ≈ 3 bin. Bedel modelin GERÇEK fiyatından
 * hesaplanıyor — sabit bir birim sayısı model değişince yanlış kalırdı.
 */
const TAHMINI_GIRDI_TOKEN = 60_000;
const TAHMINI_CIKTI_TOKEN = 3_000;
const YANIT_TOKEN = 4000;
/** Birkaç arama + okuma 60 sn'yi aşabiliyor; SDK'nın otomatik tekrarı aramaları ikilerdi. */
const ZAMAN_ASIMI_MS = 180_000;
/**
 * Sunucu tarafı döngü uzun sürerse API `pause_turn` döner; aynı turu geri
 * göndererek sürdürülür. Sonsuz döngüye karşı tavan.
 */
const MAX_DEVAM = 3;
const RAPOR_EN_IYI = 8;

/**
 * "Benzer hesap bul": Lio kullanıcının nişini çıkarır, AÇIK WEB'de bu nişteki
 * içerik üreticilerini arar ve aday hesapları kaynaklarıyla döner.
 *
 * Instagram'ın kendisi TARANMAZ (koşullara aykırı; bkz. 145_icerik_analizi.sql).
 * Web araması Anthropic'in sunucusunda çalışır — yalnızca o sağlayıcı tanımlıyken
 * özellik açık; yedek sağlayıcıya düşülmez, çünkü aramasız bir model hesap
 * adlarını uydururdu.
 *
 * Bedel iki kalem: model kullanımı (chargeUsage) ve arama adedi
 * (chargeWebSearch). Sonuç kaydedilir.
 */
@Injectable()
export class BenzerHesapService {
  private readonly logger = new Logger(BenzerHesapService.name);

  constructor(
    private supabase: SupabaseService,
    private social: SocialMediaService,
    private analiz: IcerikAnaliziService,
    private credits: AiCreditsService,
    private providers: LlmProviderRegistry
  ) {}

  async bul(
    scope: SocialScope,
    userId: string,
    secenek: { accountId?: string; istek?: string; dil: "tr" | "en" }
  ): Promise<SocialDiscovery> {
    await this.social.assertWritable(scope, userId);

    const choice = this.providers.webSearchChoice("smart");
    if (!choice) {
      throw new BadRequestException("Benzer hesap araması için web araması yapabilen bir AI sağlayıcısı (Anthropic) gerekiyor; bu sunucuda tanımlı değil.");
    }

    let hesaplar = await this.analiz.bagliHesaplar(scope);
    if (secenek.accountId) hesaplar = hesaplar.filter((h) => h.id === secenek.accountId);
    const [medya, ilhamlar] = await Promise.all([
      this.analiz.medyaListesi(hesaplar.map((h) => h.id)),
      this.analiz.ilhamListesi(scope),
    ]);
    if (medya.length === 0 && ilhamlar.length === 0 && !secenek.istek?.trim()) {
      throw new BadRequestException(
        "Lio'nun nişini anlayabilmesi için önce gönderilerini çek, ilham panosuna birkaç kaynak ekle ya da ne tür hesaplar aradığını yaz."
      );
    }

    const bakiye = await this.credits.assertCanStart(userId);
    const tokenTahmini = calculateUsageCost(choice.model, {
      inputTokens: TAHMINI_GIRDI_TOKEN,
      outputTokens: TAHMINI_CIKTI_TOKEN,
    }).credits;
    this.credits.assertBalanceCovers(bakiye, tokenTahmini + this.credits.estimateWebSearchCredits(MAX_ARAMA));

    const perf = performanslar(medya, new Date());
    const enIyiler = medya
      .filter((m) => m.caption?.trim())
      .map((m) => ({ m, kat: perf.get(m.id)?.kat ?? null }))
      .sort((a, b) => (b.kat ?? -1) - (a.kat ?? -1))
      .slice(0, RAPOR_EN_IYI)
      .map(({ m, kat }) => ({ tur: icerikTuru(m), kat, aciklama: m.caption ?? "" }));

    const haric = new Set<string>([
      ...hesaplar.map((h) => normalizeSocialHandle(h.handle)),
      ...ilhamlar.map((i) => normalizeSocialHandle(i.handle)).filter(Boolean),
    ]);
    const istek = secenek.istek?.trim().slice(0, 400) || null;

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: kesifIstemi({
          dil: secenek.dil,
          hesaplar: hesaplar.map((h) => ({
            handle: h.handle,
            tonNotu: h.tone_note,
            kitleNotu: h.audience_note,
            takipci: h.follower_count,
          })),
          enIyiler,
          ilhamlar: ilhamlar.map((i) => ({ handle: i.handle, title: i.title, note: i.note })),
          istek,
        }),
      },
    ];

    // Basit sürüm (web_search_20250305) bilerek: her modelde (Haiku dahil)
    // çalışıyor ve sonuç blokları doğrudan dönüyor — doğrulama onlara dayanıyor.
    const arac = { type: "web_search_20250305", name: "web_search", max_uses: MAX_ARAMA };
    const tumBloklar: unknown[] = [];
    let aramaSayisi = 0;
    let kredi = 0;
    let son: LlmResponse | null = null;

    try {
      for (let tur = 0; tur <= MAX_DEVAM; tur++) {
        son = await choice.provider.send({
          model: choice.model,
          max_tokens: YANIT_TOKEN,
          system: kesifSistemi(secenek.dil),
          messages,
          serverTools: [arac],
          timeoutMs: ZAMAN_ASIMI_MS,
          maxRetries: 0,
        });
        tumBloklar.push(...son.content);
        aramaSayisi += son.usage.web_search_requests ?? 0;
        // Her yanıtın token'ı ayrı kesilir: sağlayıcı her birini ayrıca işledi.
        kredi += (
          await this.credits.chargeUsage({
            userId,
            model: choice.model,
            inputTokens: son.usage.input_tokens,
            outputTokens: son.usage.output_tokens,
            cacheWriteTokens: son.usage.cache_creation_input_tokens,
            cacheReadTokens: son.usage.cache_read_input_tokens,
          })
        ).credits;
        if (son.stop_reason !== "pause_turn") break;
        // Sürdürme: yarım kalan asistan turu olduğu gibi geri gönderilir; araya
        // "devam et" mesajı EKLENMEZ — API son server_tool_use bloğundan anlıyor.
        messages.push({ role: "assistant", content: son.content as any });
      }
    } finally {
      // Aramalar yapıldıysa yanıt düşse bile bedeli oluştu.
      if (aramaSayisi > 0) {
        kredi += (await this.credits.chargeWebSearch({ userId, searches: aramaSayisi, description: "Benzer hesap keşfi" }))
          .credits;
      }
    }

    const metin = sonMetin(son?.content ?? []);

    let icerik;
    try {
      icerik = kesfiCoz(metin, gorulenAdresler(tumBloklar), haric);
    } catch (err) {
      if (err instanceof KesifOkunamadi) {
        this.logger.warn(`Keşif yanıtı okunamadı (model=${choice.model}, arama=${aramaSayisi}, kredi=${kredi})`);
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const { data, error } = await this.supabase.client
      .from("social_discoveries")
      .insert({
        ...kapsamSutunlari(scope),
        account_id: secenek.accountId ?? null,
        istek,
        icerik,
        arama_sayisi: aramaSayisi,
        kredi: Math.round(kredi),
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        // Bedel kesildi; sonucu kaybetmeyelim — kaydedilmeden döner.
        this.logger.warn("social_discoveries tablosu yok (migration 146); keşif kaydedilmedi");
        return kesfeCevir({ id: "kaydedilmedi", icerik, arama_sayisi: aramaSayisi, kredi, created_at: new Date().toISOString() });
      }
      throw error;
    }
    return kesfeCevir(data);
  }
}
