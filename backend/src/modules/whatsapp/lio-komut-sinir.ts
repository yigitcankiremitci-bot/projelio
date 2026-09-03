/**
 * WhatsApp'tan Lio'ya gelen isteklerin sınırları — saf hesap.
 *
 * Neden ayrı bir sınır var: WhatsApp'tan mesaj atmak web'e göre çok kolay
 * (telefonda tek dokunuş) ve buradan tetiklenen tur ARAÇLI çalışıyor —
 * müşteri otomatik yanıtındaki draftText'ten belirgin biçimde pahalı.
 * Kredi sistemi bakiyeyi korur ama bakiyesi dolu bir kullanıcının yanlışlıkla
 * (ya da telefonu başkasının eline geçtiğinde) dakikalar içinde kredisini
 * yakmasını engellemez. Bu tavan onu engeller.
 *
 * Veritabanı yok: "şu ana kadar şu kadar istek geldi" gerçeği dışarıdan
 * verilir, karar burada döner. whatsapp-rate-limit.ts ile aynı desen.
 *
 * Bkz. docs/whatsapp-lio-komut-plani.md §3.6
 */

export interface LioKomutConfig {
  /** Kullanıcı başına saatlik istek tavanı. */
  perHour: number;
  /** Gelen metnin üst uzunluğu (karakter). */
  maxLength: number;
}

export const DEFAULT_LIO_KOMUT: LioKomutConfig = {
  perHour: 10,
  maxLength: 1000,
};

export function lioKomutConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LioKomutConfig {
  const num = (name: string, fallback: number): number => {
    const raw = env[name];
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    perHour: num("WHATSAPP_LIO_SAATLIK", DEFAULT_LIO_KOMUT.perHour),
    maxLength: num("WHATSAPP_LIO_MAX_UZUNLUK", DEFAULT_LIO_KOMUT.maxLength),
  };
}

/** Özellik açık mı? Varsayılan KAPALI — sunucuda elle açılır. */
export function isLioCommandEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.WHATSAPP_LIO_KOMUT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "evet";
}

export type LioKomutKarar =
  | { allowed: true; text: string }
  | { allowed: false; reason: "empty" | "too_long" | "per_hour"; reply?: string };

export interface LioKomutFacts {
  /** Bu kullanıcıdan son bir saatte işlenen istek sayısı. */
  sentLastHour: number;
}

/**
 * İstek işlensin mi? Reddedilenlerde `reply` doluysa kullanıcıya o metin
 * gönderilir — sessizce yutmak "Lio beni duymuyor" hissi verirdi.
 */
export function decideLioKomut(
  config: LioKomutConfig,
  text: string,
  facts: LioKomutFacts
): LioKomutKarar {
  const trimmed = text?.trim() ?? "";
  // Boş/medya mesajı: cevap YOK. Kullanıcı fotoğraf attıysa "anlamadım"
  // demek gürültü olurdu.
  if (!trimmed) return { allowed: false, reason: "empty" };

  if (trimmed.length > config.maxLength) {
    return {
      allowed: false,
      reason: "too_long",
      reply: "Bu istek WhatsApp için çok uzun. Uzun metinlerle çalışmak için uygulamadaki Lio'yu kullanın.",
    };
  }

  if (facts.sentLastHour >= config.perHour) {
    return {
      allowed: false,
      reason: "per_hour",
      reply: "Kısa sürede çok fazla istek gönderdiniz. Biraz sonra tekrar deneyin ya da uygulamadaki Lio'yu kullanın.",
    };
  }

  return { allowed: true, text: trimmed };
}
