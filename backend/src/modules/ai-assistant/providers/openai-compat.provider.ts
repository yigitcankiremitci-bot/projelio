import { fetchWithTimeout } from "../../../common/http/fetch-with-timeout";
import type { ProviderDefinition } from "./providers.config";
import type { LlmCapabilities, LlmProvider, LlmRequest, LlmResponse } from "./llm-provider";
import { messagesToOpenAi, responseFromOpenAi, toolsToOpenAi } from "./openai-format";

/**
 * OpenAI Chat Completions uyumlu her sağlayıcı (MiniMax, z.ai/GLM, DeepSeek,
 * Groq, OpenRouter, yerel Ollama…) bu tek sınıfla konuşur — aralarındaki tek
 * fark taban adres, anahtar ve model adı, yani `providers.config.ts`'teki bir
 * satır. Her sağlayıcı için ayrı sınıf yazılmıyor.
 *
 * SDK yerine düz fetch: bu uçlar sadece bir POST; SDK bağımlılığı eklemek
 * (ve sürüm uyumu takip etmek) karşılığını vermiyor.
 */
export class OpenAiCompatProvider implements LlmProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: LlmCapabilities;
  private readonly apiKeyEnv: string;
  private readonly baseUrl: string;

  constructor(definition: ProviderDefinition) {
    this.id = definition.id;
    this.label = definition.label;
    this.capabilities = definition.capabilities;
    this.apiKeyEnv = definition.apiKeyEnv;
    this.baseUrl = (definition.baseUrl ?? "").replace(/\/+$/, "");
  }

  isConfigured(): boolean {
    return !!process.env[this.apiKeyEnv]?.trim() && !!this.baseUrl;
  }

  async send(request: LlmRequest): Promise<LlmResponse> {
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.max_tokens,
      messages: messagesToOpenAi(request.messages, request.system),
    };

    if (request.tools?.length) {
      body.tools = toolsToOpenAi(request.tools);
      body.tool_choice = "auto";
    }

    // Model düşünme/araç turları uzun sürebiliyor; asistan çağrıları için
    // varsayılan 20 sn yerine Anthropic istemcisiyle aynı 60 sn veriliyor.
    const response = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env[this.apiKeyEnv]?.trim()}`,
        },
        body: JSON.stringify(body),
      },
      60_000
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // Anthropic SDK'sının hata şekliyle aynı: çağıran taraf `status` üzerinden
      // yedeğe geçme kararını sağlayıcıdan bağımsız verebilsin.
      const error: any = new Error(`${this.label} ${response.status}: ${text.slice(0, 500)}`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();

    // Bazı uyumlu sağlayıcılar HTTP 200 ile gövdede hata döndürüyor; bu sessizce
    // "boş yanıt" gibi görünüp teşhisi zorlaştırıyordu.
    if (payload?.error) {
      const error: any = new Error(`${this.label}: ${payload.error?.message ?? "bilinmeyen hata"}`);
      error.status = payload.error?.status ?? 502;
      throw error;
    }

    return responseFromOpenAi(payload);
  }
}
