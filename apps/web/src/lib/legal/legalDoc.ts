import { getLocale } from "../i18n/depo";

/**
 * Yasal metinlerin ortak iskeleti.
 *
 * Gizlilik politikası ve kullanıcı sözleşmesi aynı biçimde yazılıp aynı sayfa
 * tarafından çiziliyor; buradaki tipler ikisinin de uyduğu kalıp. Yeni bir
 * yasal metin eklemek = yeni bir `LegalDoc` yazıp `index.ts`e kaydetmek.
 *
 * Metinler tanıtım sitesinde de yayımlanıyor (landing/,
 * src/i18n/legal.ts) ve orada da aynı `{ h, p[] }` yapısı kullanılıyor —
 * birini değiştiren diğerini de güncellemeli.
 */

/** Bir başlık ve altındaki paragraflar. */
export type LegalSection = { h: string; p: string[] };

export type LegalLang = "tr" | "en";

export interface LegalDocText {
  title: string;
  lede: string;
  /** Yürürlük tarihi, o dilin yazım biçiminde. */
  effective: string;
}

export interface LegalDoc {
  /** Uygulama içi adres — /privacy, /terms … */
  path: string;
  text: Record<LegalLang, LegalDocText>;
  sections: Record<LegalLang, LegalSection[]>;
}

/** Metinlerin dışındaki birkaç arayüz kelimesi. */
export const LEGAL_UI: Record<LegalLang, { updated: string; back: string }> = {
  tr: { updated: "Yürürlük tarihi", back: "Geri" },
  en: { updated: "Effective date", back: "Back" },
};

/**
 * Dil seçimi yasal sayfalara özeldir (uygulamanın geri kalanı Türkçe): Meta ve
 * benzeri platformlar inceleme sırasında İngilizce sürüm isteyebiliyor,
 * yurt dışındaki kullanıcı da kendi dilinde okuyabilmeli.
 */
export const LEGAL_LANG_KEY = "projelio:legal-lang";

export function initialLegalLang(): LegalLang {
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (fromQuery === "en" || fromQuery === "tr") return fromQuery;
  const saved = localStorage.getItem(LEGAL_LANG_KEY);
  if (saved === "en" || saved === "tr") return saved;
  // Uygulamanın dili: kullanıcı Ayarlar'dan İngilizce seçtiyse belge de
  // İngilizce açılmalı. Tarayıcı dilinden ÖNCE bakılıyor çünkü bu açık bir
  // seçim, o ise tahmin (bkz. lib/i18n).
  //
  // Belgenin kendi TR/EN düğmesi DURUYOR ve bunu ezebiliyor: metnin Türkçesi
  // hukuken bağlayıcı olan sürüm, İngilizce arayüz kullanan birinin de aslına
  // bakabilmesi gerekiyor.
  const uygulamaDili = getLocale();
  if (uygulamaDili) return uygulamaDili;
  // Tarayıcısı Türkçe olmayan ziyaretçiye İngilizce açılsın.
  return navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}
