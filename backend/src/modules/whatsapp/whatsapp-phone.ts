/**
 * Telefon numarası normalizasyonu ve WhatsApp sohbet kimliği (JID) dönüşümü.
 *
 * Saf fonksiyonlar: veritabanı yok, ağ yok — kenar durumları tabloyla test
 * ediliyor (whatsapp-phone.test.ts).
 *
 * Neden tek yerde: aynı numara kullanıcı profilinde "0532 123 45 67", WAHA
 * webhook'unda "905321234567@c.us", yöneticinin girdiği formda "+90 532..."
 * olarak geliyor. Üçü de aynı kişi; eşleme tek bir kanonik biçim (E.164)
 * üzerinden yapılmazsa aynı kişi üç kez kaydedilir.
 */

/** Türkiye ülke kodu; ülke kodu verilmemiş yerel numaralar buna tamamlanır. */
const DEFAULT_COUNTRY_CODE = "90";

/**
 * Serbest metni E.164'e çevirir (+905321234567). Çevrilemiyorsa null.
 *
 * Kurallar:
 *  - Rakam dışı her şey atılır ("+", boşluk, tire, parantez).
 *  - "00" ile başlıyorsa uluslararası önek sayılır ve düşürülür.
 *  - "0" ile başlayan 11 haneli numara Türkiye yerel biçimidir: 0 düşer, 90 gelir.
 *  - 10 haneli ve 5 ile başlıyorsa yine Türkiye cep numarası sayılır.
 *  - Sonuç 8–15 hane arasında olmalı (E.164 üst sınırı 15).
 */
export function normalizePhoneE164(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D+/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  else if (digits.length === 10 && digits.startsWith("5")) digits = DEFAULT_COUNTRY_CODE + digits;

  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}

/** E.164 → WhatsApp kişi JID'i: +905321234567 → 905321234567@c.us */
export function e164ToJid(phoneE164: string): string {
  return phoneE164.replace(/^\+/, "") + "@c.us";
}

/**
 * WhatsApp JID → E.164. Yalnızca kişi JID'leri (@c.us / @s.whatsapp.net)
 * çevrilir; grup (@g.us), yayın ve LID (@lid) adresleri null döner — LID'in
 * numarası WAHA'dan ayrıca sorulur (bkz. waha.client.ts resolveLid).
 */
export function jidToE164(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const match = /^(\d{8,15})@(c\.us|s\.whatsapp\.net)$/.exec(jid);
  return match ? "+" + match[1] : null;
}

export function isLidJid(jid: string | null | undefined): boolean {
  return typeof jid === "string" && jid.endsWith("@lid");
}

export function isGroupJid(jid: string | null | undefined): boolean {
  return typeof jid === "string" && jid.endsWith("@g.us");
}

/**
 * Arayüz ve loglar için maskeleme: +905321234567 → +90 532 ••• 67.
 * Tam numara yalnızca yöneticinin kişi düzenleme ekranında görünür.
 */
export function maskPhone(phoneE164: string | null | undefined): string {
  if (!phoneE164) return "";
  const digits = phoneE164.replace(/^\+/, "");
  if (digits.length < 6) return "+" + digits;
  const country = digits.slice(0, digits.length - 10) || digits.slice(0, 2);
  const rest = digits.slice(country.length);
  const head = rest.slice(0, 3);
  const tail = rest.slice(-2);
  return `+${country} ${head} ••• ${tail}`;
}
