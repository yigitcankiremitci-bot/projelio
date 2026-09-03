/**
 * Lio'nun cevabını WhatsApp'a uygun düz metne çevirir.
 *
 * Saf fonksiyon. Sistem istemi modele "markdown kullanma" diyor ama bu bir
 * RİCA: model başlık, kalın yazı ya da tablo üretirse WhatsApp'ta ham
 * yıldızlar ve boru işaretleri görünür. Burası son savunma hattı.
 *
 * Bkz. docs/whatsapp-lio-komut-plani.md §3.7
 */

/** WhatsApp'ta tek mesaj olarak okunabilir üst sınır. */
export const WHATSAPP_REPLY_LIMIT = 800;

/**
 * Markdown süslerini söker.
 *
 * Madde işaretleri KORUNUR: WhatsApp'ta "- " satırı doğal okunuyor, tek tek
 * satıra dizilmiş maddeyi düz cümleye çevirmek okunurluğu düşürürdü.
 */
export function stripMarkdown(text: string): string {
  let out = text;

  // Kod bloğu çitleri: içerik kalsın, çit gitsin (```ts → boş).
  out = out.replace(/^```[^\n]*$/gm, "");

  // Projelio dosya bağlantısı: WhatsApp'ta açılmaz, yalnızca adı kalsın.
  // [rapor.xlsx](projelio:file/abc) → rapor.xlsx
  out = out.replace(/\[([^\]]+)\]\(projelio:[^)]*\)/g, "$1");
  // Gerçek bağlantı: adres parantez içinde kalsın, tıklanabilir olsun.
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1: $2");

  // Başlıklar: satır başındaki # işaretleri.
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Tablo: satırları düz metne çevir. Ayraç satırı (|---|---|) tamamen atılır,
  // veri satırındaki hücreler " · " ile birleşir.
  out = out
    .split("\n")
    .filter((line) => !/^\s*\|?[\s:|-]*\|[\s:|-]*\|?\s*$/.test(line) || !line.includes("|"))
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return line;
      return trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(" · ");
    })
    .join("\n");

  // Kalın/italik/kod: **x** __x__ *x* _x_ `x` → x
  // WhatsApp'ın kendi *kalın* biçimi var ama markdown'la birebir aynı değil;
  // dönüştürmek yerine sadeleştirmek daha güvenli.
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, "$1$2");
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, "$1$2");
  out = out.replace(/`([^`\n]+)`/g, "$1");

  // Üçten fazla boş satır bırakma.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

/**
 * Uzun cevabı keser ve uygulamaya yönlendirir.
 *
 * Kesme kelime ortasında olmasın: son boşluktan geriye gidilir. Eklenen
 * kuyruk da sınıra dahildir, yoksa "kısalttım" derken sınırı aşardık.
 */
export function truncateForWhatsapp(text: string, webAppUrl: string, limit = WHATSAPP_REPLY_LIMIT): string {
  if (text.length <= limit) return text;
  const tail = `…\n\nTamamı için: ${webAppUrl}`;
  const room = Math.max(0, limit - tail.length);
  let cut = text.slice(0, room);
  const lastSpace = cut.lastIndexOf(" ");
  // Boşluk çok geride kaldıysa (uzun tek kelime) kelime sınırını zorlamayız.
  if (lastSpace > room * 0.6) cut = cut.slice(0, lastSpace);
  return cut.trimEnd() + tail;
}

/** İkisi bir arada: Lio'nun ham cevabı → gönderilecek metin. */
export function formatForWhatsapp(text: string, webAppUrl: string, limit = WHATSAPP_REPLY_LIMIT): string {
  return truncateForWhatsapp(stripMarkdown(text), webAppUrl, limit);
}
