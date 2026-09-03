import Anthropic from "@anthropic-ai/sdk";
import type { ProviderDefinition } from "./providers.config";
import type { LlmCapabilities, LlmProvider, LlmRequest, LlmResponse } from "./llm-provider";

/**
 * Anthropic Messages API konuşan sağlayıcı.
 *
 * Kanonik biçim Anthropic biçimi olduğu için burada HİÇBİR çeviri yoktur:
 * istek olduğu gibi SDK'ya gider, yanıt olduğu gibi döner. Sağlayıcı katmanı
 * eklenmeden önceki davranış birebir korunur.
 *
 * `baseUrl` verilirse resmî Anthropic yerine uyumlu bir uca gider — MiniMax
 * (api.minimax.io/anthropic) tam da bunu sunuyor, böylece o sağlayıcı da
 * çevirisiz çalışıyor.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: LlmCapabilities;
  private readonly apiKeyEnv: string;
  private readonly baseUrl?: string;
  private client: Anthropic | null = null;

  constructor(definition: ProviderDefinition) {
    this.id = definition.id;
    this.label = definition.label;
    this.capabilities = definition.capabilities;
    this.apiKeyEnv = definition.apiKeyEnv;
    this.baseUrl = definition.baseUrl?.replace(/\/+$/, "") || undefined;
  }

  isConfigured(): boolean {
    return !!process.env[this.apiKeyEnv]?.trim();
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: process.env[this.apiKeyEnv]?.trim(),
        ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
        // Ağ dalgalanmalarında SDK kendisi tekrar denesin.
        maxRetries: 3,
        timeout: 60_000,
      });
    }
    return this.client;
  }

  async send(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.getClient().messages.create({
      model: request.model,
      max_tokens: request.max_tokens,
      messages: request.messages,
      ...(request.system ? { system: request.system as any } : {}),
      ...(request.tools ? { tools: request.tools } : {}),
    });

    const usage: any = response.usage ?? {};
    return {
      content: response.content,
      stop_reason: response.stop_reason ?? null,
      usage: {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
