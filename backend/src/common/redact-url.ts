/**
 * Bir istek adresini log'a ya da başka bir istemciye vermeden önce temizler.
 *
 * SORUN. Bu uygulamada bazı kimlik bilgileri query string'inde dolaşıyor —
 * bu bilinçli bir tasarım (bkz. modules/auth/session-payload.ts) ama adresin
 * ham hâlde bir yere yazılması o bilgiyi de beraberinde götürüyor:
 *
 *   * `/files/:id/content?t=<JWT>` — dosya erişim jetonu (5 dk ömürlü ama yine
 *     de bir kimlik bilgisi; jetona sahip olan dosyayı indirebilir).
 *   * OAuth dönüşleri: `?code=<yetkilendirme kodu>&state=<JWT>`.
 *   * Şifre sıfırlama / e-posta doğrulama bağlantıları.
 *
 * Bunlar iki yerden dışarı çıkıyordu: hata filtresi adresi log'a yazıyor
 * (all-exceptions.filter.ts) ve canlı ekran yayıcısı adresi AYNI ODADAKİ DİĞER
 * KULLANICILARA gönderiyor (realtime.interceptor.ts). İkincisi log'dan daha
 * ciddi: kimlik bilgisi başka bir kullanıcının tarayıcısına ulaşırdı.
 *
 * YAKLAŞIM. Yol (path) aynen korunur — teşhis için asıl gereken o. Query
 * parametrelerinin ADI da korunur, yalnızca DEĞER gizlenir. İki ayrı kural:
 *
 *   1. Adı bilinen hassas parametreler her zaman gizlenir.
 *   2. Adı tanınmasa bile JWT'ye ya da uzun rastgele bir jetona BENZEYEN
 *      değerler gizlenir. Bu ikinci kural, ileride biri yeni bir jeton
 *      parametresi eklediğinde burayı güncellemeyi unutsa da korumanın
 *      çalışmasını sağlıyor.
 */

const SENSITIVE_PARAMS = new Set([
  "t",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "state",
  "secret",
  "key",
  "apikey",
  "api_key",
  "password",
  "pwd",
  "sig",
  "signature",
  "auth",
  "session",
]);

const REDACTED = "***";

/** `a.b.c` biçimi — üç bölümlü JWT. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Uzun ve rastgele görünen değer (ör. 64 karakterlik hex sıfırlama jetonu). */
const OPAQUE_TOKEN_SHAPE = /^[A-Za-z0-9_\-=+/]{32,}$/;

function isSensitive(name: string, value: string): boolean {
  if (SENSITIVE_PARAMS.has(name.toLowerCase())) return true;
  return JWT_SHAPE.test(value) || OPAQUE_TOKEN_SHAPE.test(value);
}

/**
 * @param url Ham istek adresi (`req.originalUrl`) — yol + query.
 * @returns Aynı adres, hassas query değerleri `***` ile değiştirilmiş hâlde.
 */
export function redactUrl(url: string | undefined | null): string {
  if (!url) return "";

  const queryStart = url.indexOf("?");
  if (queryStart === -1) return url;

  const path = url.slice(0, queryStart);
  const query = url.slice(queryStart + 1);
  if (!query) return path;

  const cleaned = query
    .split("&")
    .map((pair) => {
      if (!pair) return pair;
      const eq = pair.indexOf("=");
      if (eq === -1) return pair; // değeri olmayan bayrak parametresi

      const name = pair.slice(0, eq);
      const rawValue = pair.slice(eq + 1);
      // Karşılaştırmayı çözülmüş değer üzerinden yap: %2E gibi kodlamalar
      // jetonun biçimini gizleyip kontrolü atlatmasın.
      let value = rawValue;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        // Bozuk kodlama: ham hâliyle değerlendir.
      }

      return isSensitive(name, value) ? `${name}=${REDACTED}` : pair;
    })
    .join("&");

  return `${path}?${cleaned}`;
}
