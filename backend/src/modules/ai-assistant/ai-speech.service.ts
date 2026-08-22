import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

/**
 * Tek seferde seslendirilecek azami karakter.
 *
 * Ücret doğrudan karakter sayısıyla orantılı: sınır yoksa uzun bir analiz yanıtı
 * tek başına yüzlerce kredi götürür. Sınırı aşan kısım okunmaz; kullanıcı metni
 * zaten ekranda görüyor.
 */
export const MAX_SPEECH_CHARS = Number(process.env.AI_TTS_MAX_CHARS ?? 2000);

/**
 * Seçilebilir sesler.
 *
 * Bu altısı `tts-1` ve `tts-1-hd` modellerinin tamamında geçerli. OPENAI_TTS_MODEL
 * daha yeni bir modele (gpt-4o-mini-tts) çevrilirse sağlayıcıda başka sesler de
 * açılıyor; listeye eklemeden önce seçilen modelde çalıştığını doğrulayın, yoksa
 * istek 400 döner.
 *
 * Açıklamalar Türkçe okuyuştaki izlenimi anlatıyor — sesler İngilizce için
 * üretilmiş olsa da Türkçeyi anlaşılır okuyorlar.
 */
export const TTS_VOICES = [
  { id: "nova", label: "Nova", description: "Kadın · canlı ve net" },
  { id: "shimmer", label: "Shimmer", description: "Kadın · yumuşak, sakin" },
  { id: "alloy", label: "Alloy", description: "Nötr · dengeli" },
  { id: "echo", label: "Echo", description: "Erkek · sakin" },
  { id: "fable", label: "Fable", description: "Erkek · anlatıcı tonu" },
  { id: "onyx", label: "Onyx", description: "Erkek · derin" },
] as const;

export type TtsVoiceId = (typeof TTS_VOICES)[number]["id"];

export const DEFAULT_TTS_VOICE: TtsVoiceId = "nova";

/**
 * İstenen sesi doğrular.
 *
 * Doğrulanmadan geçirilirse istemciden gelen serbest metin doğrudan sağlayıcıya
 * gider; geçersiz bir değer 400 döndürür ve kullanıcı sebebini anlamaz.
 */
export function resolveVoice(requested?: string): TtsVoiceId {
  const wanted = (requested ?? "").trim().toLowerCase();
  const known = TTS_VOICES.find((v) => v.id === wanted);
  if (known) return known.id;
  const fromEnv = (process.env.OPENAI_TTS_VOICE ?? "").trim().toLowerCase();
  return TTS_VOICES.find((v) => v.id === fromEnv)?.id ?? DEFAULT_TTS_VOICE;
}

export interface SpeechResult {
  audioBase64: string;
  mimeType: string;
  /** Ücretlendirilen karakter sayısı (kırpma sonrası). */
  chars: number;
  truncated: boolean;
  /** Gerçekten kullanılan ses (geçersiz istekte varsayılana düşülür). */
  voice: string;
}

/**
 * Metni doğal sese çevirir (sunucu tarafı TTS).
 *
 * Tarayıcının kendi konuşma sentezi ücretsiz ama Türkçesi çoğu cihazda kötü.
 * Bu servis onun yerine değil YANINDA duruyor: kullanıcı hangisini istediğini
 * seçiyor, çünkü bu yol kredi harcıyor (bkz. calculateSpeechCost).
 *
 * Sağlayıcı, ses çözümlemeyle aynı (OPENAI_API_KEY); ikinci bir anahtar ya da
 * kurulum gerekmiyor.
 */
@Injectable()
export class AiSpeechService {
  private readonly logger = new Logger(AiSpeechService.name);

  get configured(): boolean {
    return !!process.env.OPENAI_API_KEY?.trim();
  }

  async synthesize(text: string, voice?: string): Promise<SpeechResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new BadRequestException(
        "Doğal ses yapılandırılmamış: backend/.env dosyasında OPENAI_API_KEY yok. " +
          "Anahtarı az önce eklediysen backend'i YENİDEN BAŞLAT — .env yalnızca açılışta okunuyor."
      );
    }

    const clean = (text ?? "").trim();
    if (!clean) throw new BadRequestException("Seslendirilecek metin boş.");

    const truncated = clean.length > MAX_SPEECH_CHARS;
    const input = truncated ? clean.slice(0, MAX_SPEECH_CHARS) : clean;

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_TTS_MODEL?.trim() || "tts-1",
          voice: resolveVoice(voice),
          input,
          response_format: "mp3",
        }),
      });
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Ses servisine ulaşılamadı: ${err?.message ?? "bağlantı hatası"}`
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // Sağlayıcının ham hatası kullanıcıya gösterilmez (anahtar/kota sızabilir).
      this.logger.error(`Seslendirme başarısız (${response.status}): ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException("Metin sese çevrilemedi. Lütfen tekrar deneyin.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new ServiceUnavailableException("Ses üretilemedi.");

    return {
      audioBase64: buffer.toString("base64"),
      mimeType: "audio/mpeg",
      chars: input.length,
      truncated,
      voice: resolveVoice(voice),
    };
  }
}
