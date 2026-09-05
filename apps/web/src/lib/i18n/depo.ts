import { isLocale } from "@projelio/shared";
import type { Locale } from "@projelio/shared";

/**
 * Dil tercihinin tarayıcıdaki deposu.
 *
 * Sağlayıcıdan (index.tsx) AYRI bir dosya çünkü `api/client.ts` de bunu okuyor
 * — her isteğe `X-Projelio-Locale` başlığını yazmak için. Sağlayıcı `api`yi
 * içe aktardığından, client'ın sağlayıcıyı içe aktarması döngü olurdu; bu
 * dosyanın hiçbir bağımlılığı yok, ikisi de rahatça kullanabiliyor.
 */

export const LOCALE_KEY = "projelio_locale";

/** Bu tarayıcıda seçilmiş dil. Seçim yoksa null — "Türkçe" DEĞİL. */
export function getLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    // Gizli sekmede localStorage okuması hata verebilir.
    return null;
  }
}

/** Seçimi yazar; `null` seçimi siler ve otomatik algılamaya döner. */
export function setStoredLocale(locale: Locale | null): void {
  try {
    if (locale) localStorage.setItem(LOCALE_KEY, locale);
    else localStorage.removeItem(LOCALE_KEY);
  } catch {
    // Yazılamazsa tercih o oturumda hatırlanmaz, dil çalışmaya devam eder.
  }
}
