/**
 * Kullanıcının girdiği bir adresin bağlantı olarak açılması güvenli mi?
 *
 * SORUN. React, JSX içine konan METNİ kaçırır — bu yüzden `{user.name}` gibi
 * ifadeler XSS'e yol açmaz. Ama ADRESLERİ kaçırmaz: `<a href={url}>` içindeki
 * url `javascript:...` ise, kullanıcı tıkladığında o kod SAYFANIN kendi
 * kökeninde çalışır. Aynısı `window.open(url)` için de geçerli.
 *
 * Projelio'da bu somut bir yol: görevlere "bağlantı eki" eklenebiliyor ve adresi
 * ekleyen kişi serbest metin giriyor. Eklenen bağlantı, görevi gören DİĞER ekip
 * üyelerine gösteriliyor; biri `javascript:` ile başlayan bir adres eklerse
 * tıklayan kişinin tarayıcısında kod çalıştırır — ve oturum jetonu localStorage'da
 * durduğu için doğrudan hesap ele geçirmeye kadar gider.
 *
 * ÇÖZÜM. Şema beyaz listesi: yalnızca http, https ve mailto. Şema yoksa https
 * varsayılır (kullanıcı çoğu zaman "ornek.com" diye yazıyor). Tanınmayan ya da
 * ayrıştırılamayan her şey reddedilir.
 *
 * Hem sunucuda (yazarken) hem istemcide (gösterirken) kullanılıyor: sunucu
 * kontrolü yeni kayıtları engelliyor, istemci kontrolü bu kural eklenmeden önce
 * kaydedilmiş olabilecek adreslere karşı koruyor.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * @returns Açılması güvenli, normalleştirilmiş adres; güvenli değilse null.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Boşluk ve kontrol karakterleri temizlenir: bunlar şema kontrolünü atlatmak
  // için kullanılıyor — araya sekme sıkıştırılmış "java<TAB>script:alert(1)"
  // bazı tarayıcılarda javascript: olarak yorumlanır.
  const cleaned = raw.replace(/[\u0000-\u0020]/g, "");
  if (!cleaned) return null;

  // Şemasız girdi ("ornek.com") kullanıcı için normal; https varsayıyoruz.
  // AMA host'ta nokta ŞART: "denemebir" gibi bir yazı `https://denemebir/` diye
  // kaydedilirse kullanıcı bağlantı eklediğini sanır, tıklayınca hiçbir yere
  // gitmez. Şemayı BİZ uydurduğumuz için doğrulama yükü de bizde. Kullanıcı
  // şemayı kendisi yazdıysa (ör. `http://wiki`) karışmıyoruz — bilerek yazmıştır.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(cleaned);
  const candidate = hasScheme ? cleaned : `https://${cleaned.replace(/^\/+/, "")}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) return null;
  // Şemayı biz eklediysek host gerçek bir alan adına benzemeli.
  if (!hasScheme && !parsed.hostname.includes(".")) return null;
  // http(s) için ana makine adı şart: "https:///" gibi girdiler geçmesin.
  if (parsed.protocol !== "mailto:" && !parsed.hostname) return null;

  return parsed.toString();
}

/** Adres güvenli mi? (Normalleştirilmiş hâline ihtiyaç duyulmayan yerler için.) */
export function isSafeExternalUrl(raw: string | null | undefined): boolean {
  return safeExternalUrl(raw) !== null;
}
