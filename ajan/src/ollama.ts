/** Ollama'nın /api/chat ucu; yalnızca bu makinede (127.0.0.1) dinliyor. */
import { request } from "node:http";

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
  const { durum, metin } = await uzunPost(
    new URL("/api/chat", ayar.url),
    JSON.stringify({
      model: ayar.model,
      stream: false,
      think: false,
      messages: mesajlar,
      tools: araclar.length ? araclar : undefined,
      options: { num_ctx: 16384, temperature: 0.4 },
    }),
    MODEL_ZAMAN_ASIMI_MS
  );
  if (durum < 200 || durum >= 300) throw new Error(`Ollama ${durum}: ${metin.slice(0, 200)}`);
  const j: any = JSON.parse(metin);
  return { role: "assistant", content: j.message?.content ?? "", tool_calls: j.message?.tool_calls };
}

/** Tek model çağrısının üst sınırı: Mac uykudan dönmezse iş sonsuza dek beklemesin. */
export const MODEL_ZAMAN_ASIMI_MS = 10 * 60_000;

/**
 * fetch DEĞİL, node:http. Node'un fetch'i (undici) yanıt başlığı 5 dakikada
 * gelmezse bağlantıyı "fetch failed" ile koparıyor ve bu sınır ayarlanamıyor
 * (undici bağımlılık olmadan içe aktarılamıyor). Ollama stream:false'ta başlığı
 * ancak yanıt bitince yazıyor; şirket profili + bağlam + öğretilenlerle büyüyen
 * istemde tek çağrı 5 dakikayı aştı (2026-11-02, Ollama günlüğünde "500 | 5m0s").
 * http.request'in böyle bir sınırı yok; süreyi burada kendimiz koyuyoruz.
 */
export function uzunPost(adres: URL, govde: string, ms: number): Promise<{ durum: number; metin: string }> {
  return new Promise((coz, reddet) => {
    const istek = request(
      adres,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(govde) } },
      (yanit) => {
        const parcalar: Buffer[] = [];
        yanit.on("data", (p: Buffer) => parcalar.push(p));
        yanit.on("end", () => {
          clearTimeout(zaman);
          coz({ durum: yanit.statusCode ?? 0, metin: Buffer.concat(parcalar).toString("utf8") });
        });
        yanit.on("error", (e) => {
          clearTimeout(zaman);
          reddet(e);
        });
      }
    );
    const zaman = setTimeout(() => istek.destroy(new Error(`Model ${Math.round(ms / 60_000)} dakikada yanıt vermedi.`)), ms);
    istek.on("error", (e) => {
      clearTimeout(zaman);
      reddet(e);
    });
    istek.end(govde);
  });
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
