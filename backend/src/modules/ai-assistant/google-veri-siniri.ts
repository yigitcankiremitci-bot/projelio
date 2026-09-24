/**
 * Google kullanıcı verisinin hangi yapay zekâ sağlayıcısına gidebileceği.
 *
 * NEDEN: Google API Hizmetleri Kullanıcı Verileri Politikası'nın "Sınırlı
 * Kullanım" (Limited Use) koşulları, Google'dan alınan verinin genel yapay zekâ
 * modellerinin eğitiminde kullanılmasını yasaklıyor — veriyi aktardığımız
 * taraf için de. Gizlilik politikamız (§7) bu yüzden takvim verisinin YALNIZCA
 * Anthropic'e gittiğini taahhüt ediyor: Anthropic'in ticari API koşulları
 * girdilerle model eğitmiyor. Yedek sağlayıcılar (MiniMax, z.ai) için bu
 * taahhüt doğrulanmadı; Anthropic geçici olarak düştüğünde takvim verisinin
 * onlara kayması, politikadaki cümleyi sessizce yalana çevirirdi.
 *
 * Kural: istek Google verisi taşıyorsa yedeğe GEÇİLMEZ — Anthropic yoksa
 * istek hata verir. Asistanın bir süre çalışmaması, verinin söz verilmemiş bir
 * yere gitmesinden iyidir.
 */

/** Google verisi taşıyan isteklerin gidebileceği sağlayıcılar (providers.config.ts kimlikleri). */
export const GOOGLE_VERISI_SAGLAYICILARI: readonly string[] = ["anthropic"];

/** Sonucu Google Takvim verisi içeren (ya da Google'a yazan) Lio araçları. */
export const GOOGLE_TAKVIM_ARACLARI = new Set<string>([
  "list_calendar_events",
  "create_calendar_event",
  "send_time_blocks_to_calendar",
  "mark_calendar_event",
]);

/**
 * Mesaj yığını Google Takvim verisi taşıyor mu? Takvim aracının çağrıldığı
 * her konuşma sayılır — sonucu (tool_result) çağrının hemen ardından gelir ve
 * sohbet geçmişiyle birlikte sonraki her turda yeniden gönderilir. Eski bir
 * sohbet, bağlantı kesildikten günler sonra sürdürülse de bu yüzden yakalanır.
 */
export function takvimVerisiIceriyor(messages: readonly { content: unknown }[]): boolean {
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const blok of m.content as { type?: string; name?: string }[]) {
      if (blok?.type === "tool_use" && blok.name && GOOGLE_TAKVIM_ARACLARI.has(blok.name)) return true;
    }
  }
  return false;
}
