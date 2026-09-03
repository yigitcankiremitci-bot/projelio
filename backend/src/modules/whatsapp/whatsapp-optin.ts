/**
 * Gelen WhatsApp metninden "komut" çıkarımı: opt-in / opt-out / eşleştirme kodu.
 *
 * Saf fonksiyon. Gelen metin GÜVENİLMEZ veridir — burada yalnızca dar bir
 * kelime kümesi tanınır; başka hiçbir şey yorumlanmaz, Lio'ya iletilmez.
 * Bkz. docs/whatsapp-qr-plan.md §8
 */

export type InboundCommand =
  | { kind: "link"; code: string }
  | { kind: "opt_out" }
  | { kind: "opt_in" }
  // "EVET": profil telefonu eşleşmesi onayı (bkz. 082). Yalnızca bekleyen aday
  // varken anlamlıdır; yoksa sıradan mesaj sayılır.
  | { kind: "confirm" }
  | { kind: "none" };

/** Eşleştirme kodu biçimi: PROJELIO-XXXX (4 karakter, karışıklık yaratan 0/O/1/I yok). */
export const LINK_CODE_PREFIX = "PROJELIO-";
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CODE_LENGTH = 4;
const LINK_CODE_PATTERN = new RegExp(`${LINK_CODE_PREFIX}([${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}})`, "i");

const OPT_OUT_WORDS = new Set(["dur", "durdur", "iptal", "stop", "cikis", "çıkış", "çık", "cik"]);
const OPT_IN_WORDS = new Set(["başlat", "baslat", "start", "devam", "aç", "ac"]);
const CONFIRM_WORDS = new Set(["evet", "onaylıyorum", "onayliyorum", "onayla", "tamam", "ok", "yes"]);

/** Türkçe büyük/küçük harf tuzakları için (İ→i, I→ı) yerel ayarlı küçültme. */
function fold(text: string): string {
  return text.trim().toLocaleLowerCase("tr-TR");
}

export function parseInboundCommand(text: string | null | undefined): InboundCommand {
  if (!text) return { kind: "none" };
  const raw = text.trim();

  const link = LINK_CODE_PATTERN.exec(raw.toUpperCase());
  if (link) return { kind: "link", code: LINK_CODE_PREFIX + link[1] };

  // Komut kelimeleri yalnızca mesaj tek kelimeden ibaretse tanınır: "dur
  // bakalım şunu da ekle" bir çıkış isteği değildir.
  const word = fold(raw).replace(/[.!]+$/, "");
  if (OPT_OUT_WORDS.has(word)) return { kind: "opt_out" };
  if (OPT_IN_WORDS.has(word)) return { kind: "opt_in" };
  if (CONFIRM_WORDS.has(word)) return { kind: "confirm" };

  return { kind: "none" };
}

/**
 * Rastgele eşleştirme kodu. Rastgelelik dışarıdan verilir ki test
 * belirlenimci olsun; üretimde crypto.randomInt kullanılır.
 */
export function generateLinkCode(randomIndex: (max: number) => number): string {
  let body = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    body += LINK_CODE_ALPHABET[randomIndex(LINK_CODE_ALPHABET.length)];
  }
  return LINK_CODE_PREFIX + body;
}

/** Kullanıcıya gösterilen wa.me bağlantısı: numaraya tıklayınca kod hazır gelir. */
export function buildLinkUrl(phoneE164: string, code: string): string {
  return `https://wa.me/${phoneE164.replace(/^\+/, "")}?text=${encodeURIComponent(code)}`;
}

/** Kullanıcıya dönen otomatik yanıtlar — tek yerde dursun, testte de görülsün. */
export const AUTO_REPLIES = {
  linked: "Projelio'ya bağlandı. Bildirimleriniz artık buradan gelecek. Durdurmak için DUR yazın.",
  linkCodeInvalid: "Bu kod geçersiz ya da süresi dolmuş. Projelio › Ayarlar › Bağlı hesaplar'dan yeni kod alın.",
  optedOut: "Projelio bildirimleri durduruldu. Yeniden başlatmak için BAŞLAT yazın.",
  optedIn: "Projelio bildirimleri yeniden açıldı. Durdurmak için DUR yazın.",
  optInUnknown: "Bu numara Projelio'da bir kullanıcıya bağlı değil. Projelio › Ayarlar › Bağlı hesaplar'dan kod alıp buraya gönderin.",
  unlinked: "Bu numara Projelio hesabınızdan ayrıldı. Yeniden bağlamak için Ayarlar › Bağlı hesaplar'dan kod alın.",
} as const;

/**
 * Profil telefonu eşleşince sorulan onay. Ad gösterilir ki yanlış kişiye
 * bağlanma riski kullanıcının gözüne görünsün ("ben Ayşe değilim" diyebilsin).
 */
export function confirmPrompt(fullName: string): string {
  return `Bu numara Projelio'da "${fullName}" hesabının profil telefonuyla eşleşiyor. Bildirimleri bu numaradan almak için EVET yazın; siz değilseniz yanıtlamayın.`;
}
