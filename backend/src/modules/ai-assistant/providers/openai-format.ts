import type Anthropic from "@anthropic-ai/sdk";
import type { LlmRequest, LlmResponse } from "./llm-provider";

/**
 * Anthropic Messages biçimi <-> OpenAI Chat Completions biçimi çevirisi.
 *
 * Ayrı dosyada duruyor çünkü test edilebilir saf fonksiyonlar: ağ yok, sınıf
 * yok. Çevirinin doğruluğu Lio'nun 68 aracının çalışıp çalışmamasını belirliyor,
 * bu yüzden `openai-format.test.ts` ile korunuyor.
 */

/** Anthropic araç şeması -> OpenAI function tanımı. */
export function toolsToOpenAi(tools: Anthropic.Tool[]): any[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.input_schema,
    },
  }));
}

/** Bloklu ya da düz sistem promptunu tek metne indirger. */
function systemToText(system: LlmRequest["system"]): string | undefined {
  if (!system) return undefined;
  if (typeof system === "string") return system;
  // cache_control burada düşer: OpenAI-uyumlu sağlayıcılarda karşılığı yok.
  return system
    .map((block) => block.text)
    .filter(Boolean)
    .join("\n\n");
}

function blockText(block: any): string {
  if (typeof block === "string") return block;
  if (block?.type === "text") return block.text ?? "";
  return "";
}

/**
 * Anthropic mesaj dizisi -> OpenAI mesaj dizisi.
 *
 * İki biçimin araç akışı yapısal olarak farklı:
 *  - Anthropic: assistant mesajının İÇİNDE `tool_use` bloğu; sonuçlar bir
 *    sonraki USER mesajının içinde `tool_result` bloğu olarak döner.
 *  - OpenAI: assistant mesajının yanında `tool_calls` dizisi; her sonuç ayrı
 *    bir `role:"tool"` mesajı.
 *
 * Bu yüzden tek bir Anthropic mesajı birden çok OpenAI mesajına açılabilir.
 */
export function messagesToOpenAi(
  messages: Anthropic.MessageParam[],
  system?: LlmRequest["system"]
): any[] {
  const out: any[] = [];

  const systemText = systemToText(system);
  if (systemText) out.push({ role: "system", content: systemText });

  for (const message of messages) {
    const content = message.content;

    if (typeof content === "string") {
      out.push({ role: message.role, content });
      continue;
    }

    if (message.role === "assistant") {
      const text = content.map(blockText).join("\n").trim();
      const toolUses = (content as any[]).filter((b) => b?.type === "tool_use");

      out.push({
        role: "assistant",
        // OpenAI araç çağrılı asistan mesajında content'in null olmasına izin
        // verir; boş string bazı sağlayıcılarda doğrulamaya takılıyor.
        content: text || null,
        ...(toolUses.length > 0
          ? {
              tool_calls: toolUses.map((b) => ({
                id: b.id,
                type: "function",
                function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
              })),
            }
          : {}),
      });
      continue;
    }

    // role === "user": tool_result blokları ayrı "tool" mesajlarına açılır,
    // geri kalan metin/görsel normal bir user mesajı olarak kalır.
    const toolResults = (content as any[]).filter((b) => b?.type === "tool_result");
    for (const result of toolResults) {
      out.push({
        role: "tool",
        tool_call_id: result.tool_use_id,
        content:
          typeof result.content === "string"
            ? result.content
            : (result.content ?? []).map(blockText).join("\n"),
      });
    }

    const rest = (content as any[]).filter((b) => b?.type !== "tool_result");
    if (rest.length > 0) {
      const hasImage = rest.some((b) => b?.type === "image");
      if (hasImage) {
        // Çok parçalı içerik: görseller data URL'e çevrilir.
        out.push({
          role: "user",
          content: rest.map((b) =>
            b.type === "image"
              ? {
                  type: "image_url",
                  image_url: {
                    url: `data:${b.source?.media_type};base64,${b.source?.data}`,
                  },
                }
              : { type: "text", text: blockText(b) }
          ),
        });
      } else {
        const text = rest.map(blockText).join("\n").trim();
        if (text) out.push({ role: "user", content: text });
      }
    }
  }

  return out;
}

/** OpenAI yanıtı -> Anthropic biçiminde LlmResponse. */
export function responseFromOpenAi(payload: any): LlmResponse {
  const choice = payload?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const content: Anthropic.ContentBlock[] = [];

  const text: string = typeof message.content === "string" ? message.content : "";
  if (text.trim()) {
    content.push({ type: "text", text, citations: null } as any);
  }

  for (const call of message.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function?.arguments || "{}");
    } catch {
      // Bozuk JSON'da aracı düşürmek yerine boş girdiyle geçiyoruz: araç
      // kendi doğrulamasında anlamlı bir hata döndürsün, tur boşa gitmesin.
      input = {};
    }
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.function?.name,
      input,
    } as any);
  }

  const usage = payload?.usage ?? {};
  // Bazı OpenAI-uyumlu sağlayıcılar önbellek okumasını bu alanda bildiriyor;
  // yoksa 0 kalır ve kredi hesabı "önbellek yok" varsayar.
  const cachedRead = usage.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    content,
    stop_reason: mapFinishReason(choice.finish_reason),
    usage: {
      // Girdi token'ı toplamdan önbellekten okunanı DÜŞÜLEREK verilir: kredi
      // hesabı ikisini ayrı fiyatlıyor, aksi hâlde aynı token iki kez sayılır.
      input_tokens: Math.max(0, (usage.prompt_tokens ?? 0) - cachedRead),
      output_tokens: usage.completion_tokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: cachedRead,
    },
  };
}

function mapFinishReason(reason: string | undefined): string | null {
  if (!reason) return null;
  if (reason === "tool_calls") return "tool_use";
  if (reason === "stop") return "end_turn";
  if (reason === "length") return "max_tokens";
  return reason;
}
