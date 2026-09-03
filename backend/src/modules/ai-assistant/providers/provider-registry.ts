import { Logger } from "@nestjs/common";
import type { LlmProvider, LlmRequest, LlmResponse } from "./llm-provider";
import { AnthropicProvider } from "./anthropic.provider";
import { OpenAiCompatProvider } from "./openai-compat.provider";
import { PROVIDER_CATALOG, defaultModelForTier, findModel, modelOverride, readProviderOrder } from "./providers.config";
import type { ModelDefinition, ProviderDefinition } from "./providers.config";

/** Bir kademe için seçilmiş sağlayıcı + o sağlayıcıdaki model adı. */
export interface ProviderChoice {
  provider: LlmProvider;
  definition: ProviderDefinition;
  model: string;
  /** Katalogdaki model kaydı — fiyat/görsel yeteneği buradan okunur. */
  info?: ModelDefinition;
}

/**
 * Sağlayıcı yönlendirici.
 *
 * Üç iş yapar:
 *  1. Katalogdan sağlayıcı nesnelerini kurar (kind'a göre doğru sınıf).
 *  2. AI_PROVIDERS sırasına ve anahtarın varlığına göre adayları süzer.
 *  3. Bir sağlayıcı GEÇİCİ olarak düşerse sıradakine geçer.
 *
 * Yedeğe geçme yalnızca geçici hatalarda olur (429, 5xx, bağlantı). Kalıcı
 * hatalarda (400 gibi "isteğin kendisi bozuk") geçilmez: aynı bozuk istek
 * ikinci sağlayıcıda da düşer, sadece iki kat para ve süre harcanır.
 */
/*
 * Dekoratör BİLEREK yok: bu sınıfın hiç bağımlılığı olmadığı için Nest onu
 * `providers` dizisinden dekoratörsüz de kurabiliyor. Karşılığında Node'un
 * yerleşik test koşucusu (tip silme; dekoratör desteklemiyor) dosyayı doğrudan
 * içe aktarabiliyor — bkz. provider-registry.test.ts.
 */
export class LlmProviderRegistry {
  private readonly logger = new Logger(LlmProviderRegistry.name);
  private readonly providers = new Map<string, LlmProvider>();

  constructor() {
    for (const definition of PROVIDER_CATALOG) {
      this.providers.set(
        definition.id,
        definition.kind === "anthropic"
          ? new AnthropicProvider(definition)
          : new OpenAiCompatProvider(definition)
      );
    }
  }

  /** Yapılandırmada sırayla listelenmiş VE anahtarı tanımlı sağlayıcılar. */
  private activeDefinitions(): ProviderDefinition[] {
    const order = readProviderOrder();
    const out: ProviderDefinition[] = [];
    for (const id of order) {
      const definition = PROVIDER_CATALOG.find((p) => p.id === id);
      const provider = definition && this.providers.get(id);
      if (!definition || !provider) continue;
      if (!provider.isConfigured()) {
        this.logger.warn(`Sağlayıcı "${id}" listede ama ${definition.apiKeyEnv} tanımlı değil; atlanıyor.`);
        continue;
      }
      out.push(definition);
    }
    return out;
  }

  /**
   * Bir kademe için sırayla denenecek sağlayıcıları döndürür.
   *
   * Kademesi tanımlı olmayan sağlayıcı o kademe için aday değildir — ör.
   * MiniMax'ta "max" kademesi yoksa güçlü model istendiğinde Anthropic'e düşer.
   */
  candidatesForTier(tier: "fast" | "smart" | "max", preferred?: string | null): ProviderChoice[] {
    const out: ProviderChoice[] = [];

    // Kullanıcı belirli bir model seçtiyse ("saglayici:model") o EN BAŞA gelir.
    // Sonrasında kademenin normal adayları yedek olarak sırada kalır: seçilen
    // model geçici olarak düşerse iş durmasın.
    const explicit = preferred ? this.resolvePreferred(preferred) : undefined;
    if (explicit) out.push(explicit);

    for (const definition of this.activeDefinitions()) {
      const overrideId = modelOverride(definition.id, tier);
      const model = overrideId
        ? definition.models.find((m) => m.id === overrideId)
        : defaultModelForTier(definition, tier);
      const modelId = overrideId ?? model?.id;
      if (!modelId) continue;
      // Kullanıcının seçtiği model zaten başa konduysa tekrar eklenmez.
      if (explicit && explicit.definition.id === definition.id && explicit.model === modelId) continue;
      out.push({ provider: this.providers.get(definition.id)!, definition, model: modelId, info: model });
    }
    return out;
  }

  /**
   * "saglayici:model" biçimindeki kullanıcı seçimini çözer.
   *
   * Sağlayıcı AI_PROVIDERS'ta etkin değilse ya da anahtarı yoksa seçim
   * yok sayılır — kullanıcı arayüzde kapalı bir sağlayıcıyı seçemez, ama eski
   * bir sohbette kayıtlı seçim kaldıysa asistan durmak yerine kademeye döner.
   */
  private resolvePreferred(preferred: string): ProviderChoice | undefined {
    const [providerId, ...rest] = preferred.split(":");
    const modelId = rest.join(":");
    if (!providerId || !modelId) return undefined;

    const found = findModel(providerId, modelId);
    if (!found) return undefined;

    const provider = this.providers.get(providerId);
    if (!provider?.isConfigured()) return undefined;
    if (!readProviderOrder().includes(providerId)) return undefined;

    return { provider, definition: found.provider, model: found.model.id, info: found.model };
  }

  /** Bir kademenin BİRİNCİL sağlayıcısı — kredi tahmini gibi çağrı öncesi işler için. */
  primaryForTier(tier: "fast" | "smart" | "max", preferred?: string | null): ProviderChoice | null {
    return this.candidatesForTier(tier, preferred)[0] ?? null;
  }

  /**
   * İsteği sırayla dener. İlk başarılı yanıt döner; hepsi düşerse SON hata
   * fırlatılır (çağıran taraf onu kullanıcı mesajına çevirir).
   *
   * `onSwitch`, gerçekten kullanılan modelin çağırana bildirilmesi içindir:
   * kredi yedeğe geçilen sağlayıcının FİYATIYLA kesilmeli, birincilinkiyle değil.
   */
  async send(
    tier: "fast" | "smart" | "max",
    build: (choice: ProviderChoice) => LlmRequest,
    options: { preferred?: string | null; onSwitch?: (choice: ProviderChoice) => void } = {}
  ): Promise<{ response: LlmResponse; choice: ProviderChoice }> {
    const { preferred, onSwitch } = options;
    const candidates = this.candidatesForTier(tier, preferred);
    if (candidates.length === 0) {
      throw new Error(`"${tier}" kademesi için yapılandırılmış sağlayıcı yok.`);
    }

    let lastError: any;
    for (let i = 0; i < candidates.length; i++) {
      const choice = candidates[i];
      try {
        if (i > 0) {
          this.logger.warn(`Sağlayıcı değişti: ${choice.definition.label} (${choice.model}) deneniyor.`);
          onSwitch?.(choice);
        }
        const response = await choice.provider.send(build(choice));
        return { response, choice };
      } catch (err: any) {
        lastError = err;
        const isLast = i === candidates.length - 1;
        if (isLast || !isTransient(err)) throw err;
        this.logger.warn(
          `${choice.definition.label} yanıt vermedi (${err?.status ?? "bağlantı"}); yedeğe geçiliyor.`
        );
      }
    }

    throw lastError;
  }

  /**
   * Kullanıcıdan gelen model seçimini doğrular.
   *
   * Geçersiz, bilinmeyen ya da kapalı bir sağlayıcıya ait seçim `null` döner:
   * asistan hata vermek yerine kademe kararına düşer. NEDEN: seçim eski bir
   * sohbette ya da yer imindeki bir istekte saklı kalmış olabilir; sağlayıcı
   * o arada kapatıldıysa kullanıcının işi durmamalı.
   */
  normalizeModelChoice(value?: string | null): string | null {
    const raw = value?.trim();
    if (!raw) return null;
    return this.resolvePreferred(raw) ? raw : null;
  }

  /**
   * Arayüzün model seçicisine giden liste: yalnızca ETKİN sağlayıcıların
   * modelleri. Kapalı bir sağlayıcının modeli seçenek olarak gösterilmez.
   */
  availableModels(): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const definition of this.activeDefinitions()) {
      for (const model of definition.models) {
        out.push({
          key: `${definition.id}:${model.id}`,
          providerId: definition.id,
          providerLabel: definition.label,
          id: model.id,
          label: model.label,
          description: model.description,
          tier: model.tier,
          vision: model.vision,
          contextWindow: model.contextWindow,
          // Arayüz "ne kadar pahalı" göstersin diye ham fiyat da gider;
          // kullanıcıya kredi cinsinden çevirmek istemcinin işi değil, ama
          // modelleri birbirine göre sıralamak için yeterli.
          price: model.price,
        });
      }
    }
    return out;
  }

  /** Teşhis için: hangi sağlayıcılar tanımlı, hangileri etkin. */
  describe(): Array<Record<string, unknown>> {
    const active = new Set(this.activeDefinitions().map((d) => d.id));
    return PROVIDER_CATALOG.map((definition) => ({
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      configured: this.providers.get(definition.id)?.isConfigured() ?? false,
      active: active.has(definition.id),
      models: definition.models.map((m) => ({
        key: `${definition.id}:${m.id}`,
        id: m.id,
        label: m.label,
        description: m.description,
        tier: m.tier,
        vision: m.vision,
        contextWindow: m.contextWindow,
        price: m.price,
      })),
      capabilities: definition.capabilities,
    }));
  }
}

/**
 * Yedeğe geçmeye değer mi?
 *
 * 401/404 sağlayıcıya özgü kalıcı yapılandırma hatası — ama YEDEĞE GEÇİLİR:
 * birincil sağlayıcının anahtarı bozuksa asistanın tamamen durması yerine
 * ikincil sağlayıcı hizmeti sürdürsün (log'da uyarı zaten kalıyor).
 * 400 geçilmez: istek bozuksa her sağlayıcıda bozuktur.
 */
function isTransient(err: any): boolean {
  const status: number | undefined = err?.status;
  if (status === undefined) return true; // bağlantı kurulamadı
  if (status === 400) return false;
  return status === 401 || status === 404 || status === 429 || status >= 500;
}
