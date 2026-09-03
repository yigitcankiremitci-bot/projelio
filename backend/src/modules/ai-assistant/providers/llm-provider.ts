import type Anthropic from "@anthropic-ai/sdk";

/**
 * Lio'nun konuştuğu sağlayıcı arayüzü.
 *
 * NEDEN ANTHROPIC BİÇİMİ KANONİK: 68 araç tanımı (`ai-assistant.tools.ts`),
 * sohbet geçmişi ve tüm servis kodu Anthropic'in Messages biçiminde yazılmış.
 * Kendi ara biçimimizi uydurup her şeyi ona çevirmek yerine, o biçimi "ortak
 * dil" kabul ediyoruz: Anthropic sağlayıcısı hiçbir çeviri yapmaz (dolayısıyla
 * bugünkü davranış birebir korunur), OpenAI-uyumlu sağlayıcılar çeviriyi
 * kendi içlerinde yapar. Çeviri maliyeti yalnızca onu gerektiren sağlayıcıya
 * yüklenir.
 */

/** Sağlayıcıya gönderilen istek. Anthropic'in MessageCreateParams'ının alt kümesi. */
export interface LlmRequest {
  model: string;
  max_tokens: number;
  messages: Anthropic.MessageParam[];
  /** Düz metin ya da bloklu sistem promptu (bloklu hâlde `cache_control` taşıyabilir). */
  system?: string | Anthropic.TextBlockParam[];
  tools?: Anthropic.Tool[];
}

/**
 * Sağlayıcıdan dönen yanıt.
 *
 * `usage` alanları Anthropic adlandırmasıyla durur; önbellek alanlarını
 * desteklemeyen sağlayıcılar 0 döner ve kredi hesabı "önbellek yok" varsayar —
 * yani müşteriden fazla değil, gerçekte olduğu kadar kesilir.
 */
export interface LlmResponse {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

/** Bir sağlayıcının hangi yeteneklere sahip olduğu. */
export interface LlmCapabilities {
  /** Prompt caching (`cache_control`) destekleniyor mu? */
  promptCaching: boolean;
  /** Araç kullanımı (tool use / function calling) destekleniyor mu? */
  tools: boolean;
  /** Görsel girdi kabul ediliyor mu? */
  vision: boolean;
}

export interface LlmProvider {
  /** Yapılandırmadaki benzersiz kimlik (ör. "anthropic", "zai", "minimax"). */
  readonly id: string;
  /** Kullanıcıya/loglara görünen ad. */
  readonly label: string;
  readonly capabilities: LlmCapabilities;

  /** API anahtarı gibi zorunlu ayarlar tanımlı mı? Değilse sağlayıcı atlanır. */
  isConfigured(): boolean;

  /**
   * İsteği gönderir. Hataları OLDUĞU GİBİ fırlatır (status alanı korunarak);
   * kullanıcıya gösterilecek mesaja çevirme işi çağıran tarafta, tek yerde
   * yapılır — böylece yedeğe geçme kararı ham hata üzerinden verilebilir.
   */
  send(request: LlmRequest): Promise<LlmResponse>;
}
