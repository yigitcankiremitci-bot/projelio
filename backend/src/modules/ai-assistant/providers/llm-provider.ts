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
  /**
   * Sağlayıcının KENDİ sunucusunda çalışan araçlar (ör. Anthropic web araması:
   * `{type: "web_search_20250305", name: "web_search", max_uses}`). Yalnızca
   * `capabilities.webSearch` olan sağlayıcıya gönderilir; diğerleri bilinmeyen
   * araç türünü reddeder.
   */
  serverTools?: Record<string, unknown>[];
  /**
   * Bu istek için zaman aşımı ve SDK'nın kendi tekrar denemesi. Varsayılanlar
   * sohbet için ayarlı (60 sn, 3 tekrar); birkaç web araması yapan bir istek
   * 60 sn'yi aşabiliyor ve otomatik tekrar aramaları — yani bedeli — ikiler.
   */
  timeoutMs?: number;
  maxRetries?: number;
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
    /**
     * `cache_creation_input_tokens`'ın 1 saatlik önbelleğe giden kısmı (yalnızca
     * Anthropic ayrıştırıyor). Lio'da 1 saatlik ömür yalnızca paylaşılan önekte
     * kullanıldığı için bu sayı doğrudan "paylaşılan önek yazımı" demek.
     */
    cache_creation_1h_input_tokens?: number;
    /** Sunucu tarafında yapılan web araması adedi (ayrıca faturalanır). */
    web_search_requests?: number;
  };
}

/** Bir sağlayıcının hangi yeteneklere sahip olduğu. */
export interface LlmCapabilities {
  /** Prompt caching (`cache_control`) destekleniyor mu? */
  promptCaching: boolean;
  /** 1 saatlik önbellek ömrü (`ttl: "1h"`) kabul ediliyor mu? Uyumlu uçlar bilinmeyen alanı reddedebilir. */
  longCacheTtl?: boolean;
  /** Araç kullanımı (tool use / function calling) destekleniyor mu? */
  tools: boolean;
  /** Görsel girdi kabul ediliyor mu? */
  vision: boolean;
  /**
   * Sunucu tarafı web araması var mı. Yalnızca resmî Anthropic ucu: MiniMax'ın
   * Anthropic uyumlu ucu aynı biçimi konuşsa da bu aracı sunmuyor.
   */
  webSearch?: boolean;
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
