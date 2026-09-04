import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { isValidTier, normalizeModelKey, normalizeTier, TIERS } from "./ai-model-settings.validate";
import type { ModelTier } from "./ai-credits.config";

export interface AiModelSettingRow {
  tier: ModelTier;
  /** "saglayici:model" ya da null (kod varsayılanı geçerli). */
  modelKey: string | null;
  updatedAt: string | null;
}

export interface AiModelSettings {
  defaultTier: ModelTier;
  tiers: AiModelSettingRow[];
}

/**
 * Lio'nun model ayarları — kademe başına hangi model çalışacak.
 *
 * NEDEN VAR: Model seçimi bir maliyet kararıdır ve yalnızca admine aittir.
 * Eskiden kullanıcı kademe seçebiliyordu (maliyeti 15 kata kadar değiştiren
 * bir karar) ve sohbet ucundaki `model` alanı hiç korumasızdı.
 *
 * ÖNBELLEK: Ayarlar her AI isteğinde okunuyor; her turda veritabanına gitmek
 * gereksiz gecikme demek. Kısa ömürlü bir önbellek tutuluyor, admin bir
 * değişiklik yaptığında elle temizleniyor — yani panelden yapılan değişiklik
 * anında geçerli oluyor, önbellek yalnızca okuma yükünü azaltıyor.
 */
/*
 * @Injectable ZORUNLU: bu sınıfın bir bağımlılığı var (SupabaseService) ve Nest
 * dekoratör olmadan constructor tiplerini okuyamıyor — enjeksiyon sessizce
 * atlanıp `this.supabase` undefined kalıyordu (canlıda "bir hata oluştu").
 * Bağımlılığı OLMAYAN LlmProviderRegistry dekoratörsüz çalışabiliyor, bu sınıf
 * çalışamaz.
 *
 * `@Inject(SupabaseService)` açıkça yazılıyor: `import type` ile alınan tip
 * derlemede silindiği için Nest'in tip-yansımasına güvenilemez.
 *
 * "Parametre özelliği" (constructor(private x)) kullanılmıyor; onu Node'un
 * tip-silme test koşucusu ayrıştıramıyor (bkz. fetch-with-timeout.ts).
 */
@Injectable()
export class AiModelSettingsService {
  private readonly logger = new Logger(AiModelSettingsService.name);
  private cache: { value: AiModelSettings; expiresAt: number } | null = null;
  private static readonly CACHE_MS = 30_000;

  private readonly supabase: SupabaseService;

  constructor(@Inject(SupabaseService) supabase: SupabaseService) {
    this.supabase = supabase;
  }

  /** Önbelleği düşürür — admin bir ayarı değiştirdiğinde çağrılır. */
  invalidate(): void {
    this.cache = null;
  }

  async get(): Promise<AiModelSettings> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;

    const bos: AiModelSettings = {
      defaultTier: "fast",
      tiers: TIERS.map((tier) => ({ tier, modelKey: null, updatedAt: null })),
    };

    try {
      const [modeller, genel] = await Promise.all([
        this.supabase.client.from("ai_model_settings").select("tier, model_key, updated_at"),
        this.supabase.client.from("ai_assistant_settings").select("default_tier").eq("id", true).maybeSingle(),
      ]);

      // Tablolar henüz oluşturulmamış olabilir (migration uygulanmadan önce).
      // Bu durumda asistanın durması kabul edilemez: eski davranışa düşülür.
      if (modeller.error || genel.error) {
        this.logger.warn(
          `Model ayarları okunamadı, kod varsayılanları kullanılıyor: ${modeller.error?.message ?? genel.error?.message}`
        );
        return bos;
      }

      const satirlar = new Map<string, { model_key: string | null; updated_at: string | null }>();
      for (const row of modeller.data ?? []) satirlar.set(row.tier, row);

      const value: AiModelSettings = {
        defaultTier: normalizeTier((genel.data as any)?.default_tier),
        tiers: TIERS.map((tier) => ({
          tier,
          modelKey: satirlar.get(tier)?.model_key ?? null,
          updatedAt: satirlar.get(tier)?.updated_at ?? null,
        })),
      };

      this.cache = { value, expiresAt: Date.now() + AiModelSettingsService.CACHE_MS };
      return value;
    } catch (err) {
      this.logger.warn(`Model ayarları okunamadı: ${(err as Error).message}`);
      return bos;
    }
  }

  /** Bir kademe için admin'in seçtiği model ("saglayici:model") ya da null. */
  async modelKeyForTier(tier: ModelTier): Promise<string | null> {
    const settings = await this.get();
    return settings.tiers.find((t) => t.tier === tier)?.modelKey ?? null;
  }

  /** Tüm kullanıcıların kullanacağı kademe. */
  async defaultTier(): Promise<ModelTier> {
    return (await this.get()).defaultTier;
  }

  /**
   * Bir kademenin modelini ayarlar. `modelKey` null ise kod varsayılanına döner.
   *
   * Seçim BURADA doğrulanır: katalogda olmayan bir model kaydedilirse asistan
   * her istekte sağlayıcıdan 404 alırdı ve sebebi panelde görünmezdi.
   */
  async setTierModel(tier: ModelTier, modelKey: string | null, adminUserId: string): Promise<void> {
    if (!isValidTier(tier)) throw new BadRequestException("Geçersiz kademe.");

    const dogrulama = normalizeModelKey(modelKey);
    if (!dogrulama.ok) throw new BadRequestException(dogrulama.error);
    const temiz = dogrulama.value;

    const { error } = await this.supabase.client
      .from("ai_model_settings")
      .upsert(
        { tier, model_key: temiz, updated_at: new Date().toISOString(), updated_by: adminUserId },
        { onConflict: "tier" }
      );
    if (error) throw new BadRequestException(`Ayar kaydedilemedi: ${error.message}`);

    this.invalidate();
    this.logger.log(`Model ayarı değişti · kademe=${tier} model=${temiz ?? "(varsayılan)"} admin=${adminUserId.slice(0, 8)}…`);
  }

  /** Varsayılan kademeyi ayarlar — tüm kullanıcılar bunu kullanır. */
  async setDefaultTier(tier: ModelTier, adminUserId: string): Promise<void> {
    if (!isValidTier(tier)) throw new BadRequestException("Geçersiz kademe.");

    const { error } = await this.supabase.client
      .from("ai_assistant_settings")
      .upsert(
        { id: true, default_tier: tier, updated_at: new Date().toISOString(), updated_by: adminUserId },
        { onConflict: "id" }
      );
    if (error) throw new BadRequestException(`Ayar kaydedilemedi: ${error.message}`);

    this.invalidate();
    this.logger.log(`Varsayılan kademe değişti · ${tier} · admin=${adminUserId.slice(0, 8)}…`);
  }
}
