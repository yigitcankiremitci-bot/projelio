/**
 * Sunucudan gelen saat dilimsiz zaman damgalarını UTC olarak işaretler.
 *
 * ## Sorun
 *
 * Veritabanındaki zaman sütunlarının çoğu "timestamp without time zone" ve
 * içlerinde UTC duruyor. PostgREST bunları EKSİZ döndürüyor
 * ("2026-09-22T15:00:00"). Tarayıcı `new Date(...)` derken eksiz metni YEREL
 * saat sanıyor: İstanbul'da her an 3 saat erken, Londra'da 1 saat erken,
 * New York'ta 4 saat geç görünüyordu.
 *
 * Doğru okuyan tek yardımcı `parseServerDate`'ti (lib/dates.ts) ve yalnızca 5
 * dosya onu kullanıyordu; 60'tan fazla ekran düz `new Date()` ile okuyordu.
 * Her birini tek tek düzeltmek yeni ekranda aynı hatayı tekrar ettirirdi —
 * o yüzden yanıt, API istemcisine girdiği anda bir kez düzeltiliyor
 * (bkz. api/client.ts `parseResponse`). Sonrasında düz `new Date()` de
 * `parseServerDate` de aynı, doğru anı verir ve tarayıcı onu KULLANICININ
 * saat diliminde gösterir.
 *
 * ## İstisna: sabit saatler
 *
 * Bazı alanlar bir AN değil, duvar saatidir; her ülkede aynı görünmeleri
 * gerekir ve bilerek yerel saat olarak saklanır:
 *   - Yaptım kayıtları (`done_at`, `started_at`, `ended_at`, `timer_started_at`):
 *     istemci yerel damgayı "YYYY-MM-DDTHH:MM:SS" olarak yazar, gün hesabı
 *     `slice(0, 10)` ile yapılır (bkz. pages/WorkLog.tsx `simdiYerel`).
 *   - Son tarihler (`deadline`, `due_date`, `start_date`…): yalnızca gün
 *     seçildiğinde UTC gece yarısı saklanıyor. UTC diye okunsa Amerika'daki
 *     kullanıcı son tarihi BİR GÜN ÖNCE görürdü.
 * Bunlar olduğu gibi bırakılır; davranışları değişmez.
 */

/** Saat dilimi eki olmayan tarih-saat: "2026-09-22T15:00" ya da ":00.123456" ile. */
const EKSIZ_ZAMAN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/;

/** Duvar saati olan alanlar — hem sütun adıyla hem backend'in camelCase karşılığıyla. */
export const SABIT_SAAT_ALANLARI: ReadonlySet<string> = new Set([
  "deadline",
  "start_date",
  "startDate",
  "due_date",
  "dueDate",
  "personal_due_date",
  "personalDueDate",
  "effective_due_date",
  "effectiveDueDate",
  "project_deadline",
  "projectDeadline",
  "done_at",
  "doneAt",
  "started_at",
  "startedAt",
  "ended_at",
  "endedAt",
  "timer_started_at",
  "timerStartedAt",
]);

/**
 * Yanıtı yerinde düzeltir ve aynı nesneyi döndürür (JSON.parse'tan taze
 * geldiği için kopyalamaya gerek yok). Anahtarı bilinmeyen değerlere (dizi
 * elemanı olan düz metinler) dokunulmaz: bir metnin zaman olduğunu ancak
 * hangi alanda durduğundan anlayabiliyoruz.
 */
export function sunucuZamanlariniIsaretle<T>(deger: T): T {
  isle(deger);
  return deger;
}

function isle(deger: unknown): void {
  if (Array.isArray(deger)) {
    for (const oge of deger) if (oge && typeof oge === "object") isle(oge);
    return;
  }
  if (!deger || typeof deger !== "object") return;
  const nesne = deger as Record<string, unknown>;
  for (const anahtar of Object.keys(nesne)) {
    const v = nesne[anahtar];
    if (typeof v === "string") {
      if (EKSIZ_ZAMAN.test(v) && !SABIT_SAAT_ALANLARI.has(anahtar)) nesne[anahtar] = `${v}Z`;
    } else if (v && typeof v === "object") {
      isle(v);
    }
  }
}
