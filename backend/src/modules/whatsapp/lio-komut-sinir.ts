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
  // 10'du; bir taslağı birkaç kez düzeltip onaylamak (2026-09-30 akşamı) bir
  // saatte sınıra dayanıyordu. Kullanıcı kararıyla 30 (2026-10-02).
  perHour: 30,
  // 1000'di; gerçek kullanımda dar kaldı (2026-10-02: kullanıcının uzun mesajı
  // reddedildi — bir Instagram açıklaması tek başına 2200 karakter olabiliyor).
  // Maliyet kaygısı küçük: her istekte zaten ~54 bin tokenlık sistem istemi
  // gidiyor, 8000 karakter ~2.500 token ekler.
  maxLength: 8000,
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
      reply:
        `Mesajın çok uzun (${trimmed.length.toLocaleString("tr-TR")} karakter; WhatsApp'tan en fazla ` +
        `${config.maxLength.toLocaleString("tr-TR")}). Kısaltıp gönder ya da uygulamadaki Lio'yu kullan.`,
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

/**
 * Duraklatılmış bir işe ("devam edeyim mi?") verilen cevap.
 *
 * NEDEN: WhatsApp'ta "devam et" eskiden duraklatılan işi SÜRDÜRMÜYORDU; yeni
 * bir istek oluyor ve model işi baştan yapıyordu. 2026-10-02'de 8 ana görev
 * üç kez açıldı, alt görevler üst göreve bağlanamadı. Yalnızca mesajın
 * TAMAMI bir onay/ret ise karar verilir; "devam et ama önce şunu düzelt"
 * yeni bir istektir.
 */
export type DevamKarari = "devam" | "durdur" | null;

const DEVAM = new Set([
  "devam", "devam et", "devam edin", "devam edebilirsin", "devam etsin", "sürdür", "evet",
  "evet devam", "evet devam et", "tamam", "tamam devam", "olur", "ok", "okey", "yes", "continue", "go on",
]);
const DURDUR = new Set(["vazgeç", "vazgec", "hayır", "hayir", "dur", "iptal", "yeter", "durdur", "no", "stop"]);

export function devamCevabi(metin: string | null | undefined): DevamKarari {
  const t = (metin ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[.!?,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (DEVAM.has(t)) return "devam";
  if (DURDUR.has(t)) return "durdur";
  return null;
}
