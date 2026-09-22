import { isLocale, resolveLocale } from "@projelio/shared";
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

/**
 * Ekranda görünen dil: seçim varsa o, yoksa tarayıcının dili.
 *
 * Sunucuya giden `X-Projelio-Locale` başlığı eskiden yalnızca SEÇİM varken
 * yazılıyordu; dil otomatik algılandığında sunucu arayüzün hangi dilde
 * olduğunu bilmiyor ve tarayıcının ham başlığıyla tahmin yürütüyordu.
 */
export function etkinDil(): Locale {
  const secim = getLocale();
  if (secim) return secim;
  // Tarayıcı dışında (Node test koşucusu) kaynak dil. Node 21+ `navigator`
  // tanımlıyor ve dilini "en-US" bildiriyor; bakılsaydı testler makinenin
  // diline göre değişirdi.
  if (typeof window === "undefined" || typeof navigator === "undefined") return resolveLocale([]);
  return resolveLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/**
 * Tarih ve sayı biçimlendirmenin dili ("tr-TR" / "en-GB").
 *
 * Biçimlendirme çağrılarında dil sabit "tr-TR" yazılıydı; İngilizce arayüzde
 * tarihler "12 Eyl 2026" diye çıkıyordu. en-GB seçildi: gün-ay-yıl sırası
 * Türkçe biçimle aynı, yalnızca adlar ve ayraçlar değişiyor.
 */
export function bicimDili(): string {
  return etkinDil() === "en" ? "en-GB" : "tr-TR";
}

/**
 * Yüzde yazımı: Türkçede işaret önde ("%40"), İngilizcede arkada ("40%").
 * Şablonlarda `%${n}` sabit yazılıydı; İngilizce arayüzde "%40" görünüyordu.
 */
export function yuzde(n: number | string): string {
  return etkinDil() === "en" ? `${n}%` : `%${n}`;
}
