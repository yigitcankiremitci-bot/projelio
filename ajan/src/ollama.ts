/** Ollama'nın /api/chat ucu; yalnızca bu makinede (127.0.0.1) dinliyor. */

export interface Mesaj {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: AracCagrisi[];
  tool_name?: string;
}

export interface AracCagrisi {
  function: { name: string; arguments: Record<string, unknown> };
}

export interface AracTanimi {
  type: "function";
  function: { name: string; description: string; parameters: { type: "object"; properties: Record<string, unknown>; required: string[] } };
}

export interface OllamaAyar {
  url: string;
  model: string;
}

/**
 * Tek bir model çağrısı. `think: false`: qwen3'ün düşünme kipi her adımda
 * yüzlerce token daha yazdırıyor; Mac'te bu dakikalar demek, araç seçimi için
 * de gerekmiyor.
 */
export async function sohbet(ayar: OllamaAyar, mesajlar: Mesaj[], araclar: AracTanimi[]): Promise<Mesaj> {
  const y = await fetch(new URL("/api/chat", ayar.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10 * 60_000),
    body: JSON.stringify({
      model: ayar.model,
      stream: false,
      think: false,
      messages: mesajlar,
      tools: araclar.length ? araclar : undefined,
      options: { num_ctx: 16384, temperature: 0.4 },
    }),
  });
  if (!y.ok) throw new Error(`Ollama ${y.status}: ${(await y.text()).slice(0, 200)}`);
  const j: any = await y.json();
  return { role: "assistant", content: j.message?.content ?? "", tool_calls: j.message?.tool_calls };
}

export async function ollamaHazirMi(ayar: OllamaAyar): Promise<string | null> {
  try {
    const y = await fetch(new URL("/api/tags", ayar.url), { signal: AbortSignal.timeout(5000) });
    if (!y.ok) return "Ollama yanıt vermiyor.";
    const j: any = await y.json();
    const var_ = (j.models ?? []).some((m: any) => m.name === ayar.model || m.model === ayar.model);
    return var_ ? null : `${ayar.model} modeli indirilmemiş (ollama pull ${ayar.model}).`;
  } catch {
    return "Ollama çalışmıyor (brew services start ollama).";
  }
}
