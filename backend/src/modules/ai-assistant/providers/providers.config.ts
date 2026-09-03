import type { LlmCapabilities } from "./llm-provider";

/**
 * Sağlayıcı ve model kataloğu.
 *
 * Buraya satır eklemek yeni sağlayıcı/model eklemeye yeter — OpenAI ya da
 * Anthropic uyumlu bir API sunduğu sürece kod yazmak gerekmez.
 *
 * FİYATLAR: Eylül 2026 liste fiyatları, milyon token başına USD. Sağlayıcılar
 * fiyat değiştirdiğinde burası güncellenmeli; `ai-credits.config.ts` bu
 * tablodan besleniyor, tabloda olmayan model DEFAULT_PRICING'e (pahalı) düşer.
 */

export type ProviderKind = "anthropic" | "openai-compat";

/** Milyon token başına USD. `cachedInput` yoksa önbellek indirimi hesaplanmaz. */
export interface ModelPrice {
  input: number;
  output: number;
  cachedInput?: number;
}

export interface ModelDefinition {
  /** Sağlayıcının API'sine gönderilen tam model kimliği. */
  id: string;
  /** Arayüzde görünen ad. */
  label: string;
  /** Kısa açıklama — model seçim ekranında gösterilir. */
  description: string;
  price: ModelPrice;
  /** Bağlam penceresi (token). Bilgi amaçlı, arayüzde gösterilir. */
  contextWindow: number;
  /** Görsel girdi kabul ediyor mu? (Sağlayıcı geneli değil, MODEL bazında.) */
  vision: boolean;
  /**
   * Bu modelin varsayılan olarak hangi kademeye oturduğu. Aynı kademeye birden
   * çok model konabilir; kademenin varsayılanı listedeki İLK modeldir.
   */
  tier: "fast" | "smart" | "max";
}

export interface ProviderDefinition {
  id: string;
  label: string;
  kind: ProviderKind;
  /** OpenAI/Anthropic uyumlu uç için taban adres. Resmî Anthropic'te boş. */
  baseUrl?: string;
  apiKeyEnv: string;
  capabilities: LlmCapabilities;
  models: ModelDefinition[];
}

export const PROVIDER_CATALOG: ProviderDefinition[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    capabilities: { promptCaching: true, tools: true, vision: true },
    models: [
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        description: "Günlük işler: listeleme, görev ekleme, durum güncelleme.",
        price: { input: 1, output: 5 },
        contextWindow: 200_000,
        vision: true,
        tier: "fast",
      },
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        description: "Çok adımlı planlama, analiz ve belirsiz isteklerin yorumlanması.",
        price: { input: 3, output: 15 },
        contextWindow: 200_000,
        vision: true,
        tier: "smart",
      },
      {
        id: "claude-opus-5",
        label: "Claude Opus 5",
        description: "En zor işler. Belirgin şekilde pahalıdır; yalnızca gerektiğinde.",
        price: { input: 15, output: 75 },
        contextWindow: 200_000,
        vision: true,
        tier: "max",
      },
    ],
  },
  {
    id: "zai",
    label: "z.ai (GLM)",
    kind: "openai-compat",
    baseUrl: "https://api.z.ai/api/paas/v4",
    apiKeyEnv: "ZAI_API_KEY",
    // GLM önbelleği destekliyor ama Anthropic'in açık `cache_control` işaretini
    // değil — kendi tarafında otomatik yapıyor. Bizim işaretimiz gönderilmez;
    // önbellekten okunan token yanıtta bildirilirse kredi hesabına girer.
    capabilities: { promptCaching: false, tools: true, vision: false },
    models: [
      {
        // Ücretsiz (2026-09 itibarıyla). Bakiye gerektirmiyor; araç çağırmayı
        // doğru yapıyor. Bu yüzden z.ai'nin "hızlı" kademesinde İLK sırada:
        // bakiyesi olmayan bir hesapta bile sağlayıcı çalışır durumda kalır.
        id: "glm-4.7-flash",
        label: "GLM 4.7 Flash (ücretsiz)",
        description: "Ücretsiz ve hızlı. Basit, tek adımlı işler için.",
        price: { input: 0, output: 0 },
        contextWindow: 128_000,
        vision: false,
        tier: "fast",
      },
      {
        id: "glm-4.5-flash",
        label: "GLM 4.5 Flash (ücretsiz)",
        description: "Ücretsiz, bir önceki kuşak. Yedek seçenek.",
        price: { input: 0, output: 0 },
        contextWindow: 128_000,
        vision: false,
        tier: "fast",
      },
      {
        id: "glm-5.3-flash",
        label: "GLM 5.3 Flash",
        description: "Çok ucuz ve hızlı. Basit, tek adımlı işler için.",
        price: { input: 0.075, output: 0.25, cachedInput: 0.015 },
        contextWindow: 200_000,
        vision: false,
        tier: "fast",
      },
      {
        id: "glm-4.7-flashx",
        label: "GLM 4.7 FlashX",
        description: "Hızlı ve ucuz; günlük işlerde dengeli bir alternatif.",
        price: { input: 0.07, output: 0.4, cachedInput: 0.01 },
        contextWindow: 128_000,
        vision: false,
        tier: "fast",
      },
      {
        id: "glm-5.3",
        label: "GLM 5.3",
        description: "z.ai'nin güncel amiral modeli. 1M bağlam, güçlü araç kullanımı.",
        price: { input: 1.4, output: 4.4, cachedInput: 0.26 },
        contextWindow: 1_000_000,
        vision: false,
        tier: "smart",
      },
      {
        id: "glm-4.7",
        label: "GLM 4.7",
        description: "Önceki kuşak; belirgin şekilde ucuz, çoğu iş için yeterli.",
        price: { input: 0.6, output: 2.2, cachedInput: 0.11 },
        contextWindow: 200_000,
        vision: false,
        tier: "smart",
      },
      {
        id: "glm-4.6v",
        label: "GLM 4.6V (görsel)",
        description: "Görsel okuyabilen ucuz model. Ekran görüntüsü/belge için.",
        price: { input: 0.3, output: 0.9, cachedInput: 0.05 },
        contextWindow: 64_000,
        vision: true,
        tier: "smart",
      },
      {
        id: "glm-5",
        label: "GLM 5",
        description: "Amiral sürümlerden ucuz, 4.7'den güçlü orta seçenek.",
        price: { input: 1, output: 3.2, cachedInput: 0.2 },
        contextWindow: 200_000,
        vision: false,
        tier: "smart",
      },
      {
        id: "glm-4.5-air",
        label: "GLM 4.5 Air",
        description: "Çok ucuz, hafif model. Yoğun ve basit iş akışları için.",
        price: { input: 0.2, output: 1.1, cachedInput: 0.03 },
        contextWindow: 128_000,
        vision: false,
        tier: "smart",
      },
      {
        id: "glm-4.6v-flashx",
        label: "GLM 4.6V FlashX (görsel)",
        description: "Görsel okuyan en ucuz seçenek.",
        price: { input: 0.04, output: 0.4, cachedInput: 0.004 },
        contextWindow: 64_000,
        vision: true,
        tier: "smart",
      },
      {
        id: "glm-5.2",
        label: "GLM 5.2",
        description: "Bir önceki amiral sürüm; 5.3 ile aynı fiyat bandında.",
        price: { input: 1.4, output: 4.4, cachedInput: 0.26 },
        contextWindow: 200_000,
        vision: false,
        tier: "max",
      },
      {
        id: "glm-5.1",
        label: "GLM 5.1",
        description: "5.2 öncesi amiral sürüm; aynı fiyat bandında.",
        price: { input: 1.4, output: 4.4, cachedInput: 0.26 },
        contextWindow: 200_000,
        vision: false,
        tier: "max",
      },
      {
        id: "glm-4.5-x",
        label: "GLM 4.5-X",
        description: "4.5 ailesinin en güçlüsü; pahalı.",
        price: { input: 2.2, output: 8.9, cachedInput: 0.45 },
        contextWindow: 128_000,
        vision: false,
        tier: "max",
      },
    ],
  },
  {
    id: "minimax",
    label: "MiniMax",
    // ÖNEMLİ: MiniMax'ın Anthropic uyumlu ucu var (/anthropic). Onu kullanıyoruz
    // çünkü Lio'nun kanonik biçimi zaten Anthropic biçimi — çeviri katmanı
    // devreye girmiyor, araç akışı birebir aynı yoldan geçiyor. OpenAI ucuna
    // gitmek gereksiz bir çeviri (ve hata yüzeyi) eklerdi.
    kind: "anthropic",
    baseUrl: "https://api.minimax.io/anthropic",
    apiKeyEnv: "MINIMAX_API_KEY",
    capabilities: { promptCaching: false, tools: true, vision: true },
    models: [
      {
        id: "MiniMax-M2.7-highspeed",
        label: "MiniMax M2.7 Hızlı",
        description: "M2.7'nin hızlandırılmış sürümü; günlük işler için.",
        price: { input: 0.3, output: 1.2 },
        contextWindow: 200_000,
        vision: false,
        tier: "fast",
      },
      {
        id: "MiniMax-M2.7",
        label: "MiniMax M2.7",
        description: "Araç kullanımında güçlü, ucuz bir orta seviye model.",
        price: { input: 0.3, output: 1.2 },
        contextWindow: 200_000,
        vision: false,
        tier: "smart",
      },
      {
        id: "MiniMax-M2.5",
        label: "MiniMax M2.5",
        description: "Bir önceki kuşak; M2.7 ile aynı fiyat bandında.",
        price: { input: 0.3, output: 1.2 },
        contextWindow: 200_000,
        vision: false,
        tier: "smart",
      },
      {
        id: "MiniMax-M2.1",
        label: "MiniMax M2.1",
        description: "Daha eski kuşak; uyumluluk için tutuluyor.",
        price: { input: 0.3, output: 1.2 },
        contextWindow: 200_000,
        vision: false,
        tier: "smart",
      },
      {
        id: "MiniMax-M2",
        label: "MiniMax M2",
        description: "İlk M2 sürümü; en ucuz MiniMax seçeneği.",
        price: { input: 0.255, output: 1.02 },
        contextWindow: 200_000,
        vision: false,
        tier: "smart",
      },
      {
        id: "MiniMax-M3",
        label: "MiniMax M3",
        description: "1M bağlam, görsel ve video destekli amiral model.",
        // 512K token üstünde fiyat ikiye katlanıyor; buradaki standart tarife.
        price: { input: 0.3, output: 1.2, cachedInput: 0.06 },
        contextWindow: 1_000_000,
        vision: true,
        tier: "max",
      },
    ],
  },
];

/** Katalogdaki tüm modeller, `sağlayıcı:model` kimliğiyle düzleştirilmiş. */
export function allModels(): Array<{ provider: ProviderDefinition; model: ModelDefinition; key: string }> {
  const out: Array<{ provider: ProviderDefinition; model: ModelDefinition; key: string }> = [];
  for (const provider of PROVIDER_CATALOG) {
    for (const model of provider.models) {
      out.push({ provider, model, key: `${provider.id}:${model.id}` });
    }
  }
  return out;
}

/** Katalogdaki fiyatları MODEL_PRICING biçimine çevirir (tek kaynak burası). */
export function catalogPricing(): Record<string, { inputPerMillion: number; outputPerMillion: number }> {
  const out: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {};
  for (const { model } of allModels()) {
    out[model.id] = { inputPerMillion: model.price.input, outputPerMillion: model.price.output };
  }
  return out;
}

/**
 * Sıralama ve açık/kapalı durumu ortam değişkeninden gelir:
 *
 *   AI_PROVIDERS=anthropic,zai        → önce Anthropic, o olmazsa z.ai
 *   AI_PROVIDERS=zai,anthropic        → önce z.ai (ucuz), yedek Anthropic
 *
 * Tanımsızsa yalnızca Anthropic çalışır. NEDEN: Yeni sağlayıcı eklemenin bir
 * dağıtımda kendiliğinden devreye girmesi istenmiyor — hangi sağlayıcıya
 * müşteri verisi gittiği bilinçli bir karar olmalı (bkz. CLAUDE.md, KVKK notu).
 */
export const DEFAULT_PROVIDER_ORDER = ["anthropic"];

export function readProviderOrder(): string[] {
  const raw = process.env.AI_PROVIDERS?.trim();
  if (!raw) return DEFAULT_PROVIDER_ORDER;

  const known = new Set(PROVIDER_CATALOG.map((p) => p.id));
  const seen = new Set<string>();
  const order: string[] = [];

  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    // Bilinmeyen ya da tekrar eden kimlikler sessizce atlanır: yazım hatası
    // yüzünden asistanın tamamen durması, yanlış sıradan daha kötü.
    if (!id || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }

  return order.length > 0 ? order : DEFAULT_PROVIDER_ORDER;
}

/**
 * Bir kademe için model seçimini ezer: AI_MODEL_<SAGLAYICI>_<KADEME>
 * Örn: AI_MODEL_ZAI_SMART=glm-4.7
 *
 * Eski ANTHROPIC_MODEL değişkeni geriye dönük çalışır (yalnızca Anthropic'in
 * "fast" kademesini ezer — bkz. modelForTier'daki açıklama).
 */
export function modelOverride(providerId: string, tier: string): string | undefined {
  const key = `AI_MODEL_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${tier.toUpperCase()}`;
  return process.env[key]?.trim() || undefined;
}

/** Bir sağlayıcının verilen kademedeki varsayılan modeli (listedeki ilk). */
export function defaultModelForTier(
  provider: ProviderDefinition,
  tier: "fast" | "smart" | "max"
): ModelDefinition | undefined {
  return provider.models.find((m) => m.tier === tier);
}

/** Kimlikten model bulur; kullanıcı seçimini doğrulamak için. */
export function findModel(
  providerId: string,
  modelId: string
): { provider: ProviderDefinition; model: ModelDefinition } | undefined {
  const provider = PROVIDER_CATALOG.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  return provider && model ? { provider, model } : undefined;
}
