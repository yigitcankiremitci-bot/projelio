/**
 * "Açılır pencere iznini nereden veririm?" sorusunun tarayıcıya göre cevabı.
 *
 * NEDEN VAR: bir tıklamadan yalnızca BİR sekme açılabiliyor (window.open
 * kullanıcı hareketini tüketiyor). Birden çok hesabı aynı anda açmanın tek
 * yolu, kullanıcının o siteye açılır pencere izni vermesi. İzin site
 * tarafından İSTENEMİYOR — kamera/konum gibi bir Permissions API'si yok, karar
 * yalnızca tarayıcı ayarında veriliyor. Elimizden gelen, doğru yeri tarif
 * etmek.
 *
 * Ayar adresi (chrome://…, about:…) bilerek "aç" değil "kopyala" olarak
 * kullanılıyor: tarayıcılar güvenlik gereği bu şemalara SAYFADAN gezinmeyi
 * engelliyor — <a href="chrome://settings"> tıklandığında hiçbir şey olmuyor,
 * hata bile vermiyor. Kullanıcının adres çubuğuna kendisinin yapıştırması
 * gerekiyor.
 */

export type BrowserKey = "chrome" | "edge" | "brave" | "opera" | "firefox" | "safari" | "other";

export interface PopupSettingsHint {
  key: BrowserKey;
  /** Kullanıcıya gösterilecek tarayıcı adı. Marka adı, çevrilmez. */
  label: string;
  /** Ayar sayfasının adresi — kopyalanır, açılmaz. Safari'de yok. */
  settingsUrl?: string;
}

/**
 * Tarayıcıyı user-agent'tan çıkarır.
 *
 * SIRA ÖNEMLİ: Edge, Opera ve Brave user-agent'ta kendilerini Chrome olarak da
 * tanıtıyor ("… Chrome/… Safari/… Edg/…"). Önce türevlere, en sona Chrome'a
 * bakılmalı; ters sırada herkes Chrome görünür ve kullanıcıya var olmayan bir
 * ayar sayfası tarif ederiz. Aynı sebeple Safari en sonda: Chrome da UA'sında
 * "Safari" taşıyor.
 *
 * Brave user-agent'ında hiçbir iz bırakmıyor (bilerek — parmak izi direnci);
 * varlığı `navigator.brave` ile anlaşılıyor, o yüzden ayrı parametre.
 */
export function detectBrowser(userAgent: string, isBrave = false): PopupSettingsHint {
  const ua = userAgent || "";

  if (isBrave) return { key: "brave", label: "Brave", settingsUrl: "brave://settings/content/popups" };
  if (/\bEdgi?A?\//.test(ua) || /\bEdg\//.test(ua))
    return { key: "edge", label: "Microsoft Edge", settingsUrl: "edge://settings/content/popups" };
  if (/\bOPR\//.test(ua) || /\bOpera\//.test(ua))
    return { key: "opera", label: "Opera", settingsUrl: "opera://settings/content/popups" };
  if (/\bFirefox\//.test(ua) || /\bFxiOS\//.test(ua))
    return { key: "firefox", label: "Firefox", settingsUrl: "about:preferences#privacy" };
  if (/\bChrome\//.test(ua) || /\bCriOS\//.test(ua))
    return { key: "chrome", label: "Google Chrome", settingsUrl: "chrome://settings/content/popups" };
  // Safari'de açılır pencere ayarının adresi yok; menüden gidiliyor.
  if (/\bSafari\//.test(ua)) return { key: "safari", label: "Safari" };

  return { key: "other", label: "" };
}

/** Tarayıcıdan okunan hâli — bileşenler bunu çağırır. */
export function popupSettingsHint(): PopupSettingsHint {
  if (typeof navigator === "undefined") return { key: "other", label: "" };
  // `navigator.brave` yalnızca Brave'de var; tipi yok, o yüzden dar bir cast.
  const brave = Boolean((navigator as Navigator & { brave?: unknown }).brave);
  return detectBrowser(navigator.userAgent, brave);
}
