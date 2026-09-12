import type { PasskeyAuthOptions, PasskeyRegistrationOptions } from "@projelio/shared";

/**
 * Tarayıcı tarafındaki geçiş anahtarı (WebAuthn) işleri.
 *
 * Bu dosya YALNIZCA biçim çevirisi yapar: sunucu base64url metinlerle
 * konuşuyor, `navigator.credentials` ise ArrayBuffer istiyor. Doğrulamanın
 * tamamı sunucuda (backend/src/common/webauthn/) — tarayıcıdan gelen hiçbir
 * şeye güvenilmiyor, burada yapılan tek şey cihazı çağırmak.
 *
 * KULLANICI HAREKETİ ŞART: `navigator.credentials.get/create` ancak bir
 * tıklamanın içinden çağrılabiliyor (tarayıcı kuralı). Bu yüzden bu
 * fonksiyonlar düğme tıklamasından ZİNCİRLEME çağrılır ve araya await konmaz —
 * seçenekleri önce almak gerektiğinde bile tek tıklamadan çıkan zincir
 * korunuyor, çünkü Safari araya giren uzun işlerde izni düşürebiliyor.
 */

export function desteklenirMi(): boolean {
  return typeof window !== "undefined" && Boolean(window.PublicKeyCredential) && Boolean(navigator.credentials);
}

/**
 * base64url → ArrayBuffer.
 *
 * Dönüş tipi ArrayBuffer (Uint8Array değil): TypeScript 5.7'den beri
 * Uint8Array'in arkasındaki tampon türü de tipin parçası ve `BufferSource`
 * yalnızca ArrayBuffer destekli olanı kabul ediyor. Doğrudan tamponu döndürmek
 * bu ayrımı tamamen es geçiyor.
 */
function b64urlCoz(deger: string): ArrayBuffer {
  const b64 = deger.replace(/-/g, "+").replace(/_/g, "/");
  const ham = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  const tampon = new ArrayBuffer(ham.length);
  const baytlar = new Uint8Array(tampon);
  for (let i = 0; i < ham.length; i++) baytlar[i] = ham.charCodeAt(i);
  return tampon;
}

/** Metni ham baytlara çevirir — kullanıcı kimliği böyle gidiyor. */
function metinBaytlari(metin: string): ArrayBuffer {
  const kodlu = new TextEncoder().encode(metin);
  const tampon = new ArrayBuffer(kodlu.length);
  new Uint8Array(tampon).set(kodlu);
  return tampon;
}

function b64url(buf: ArrayBuffer): string {
  const baytlar = new Uint8Array(buf);
  let metin = "";
  for (const bayt of baytlar) metin += String.fromCharCode(bayt);
  return btoa(metin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Yeni bir geçiş anahtarı oluşturur.
 *
 * `userVerification: "required"`: kilidi açan şey cihazın varlığı DEĞİL,
 * kullanıcının kendisi (parmak izi / yüz / PIN). Sunucu da bunu şart koşuyor;
 * burada istemek, doğrulamayı yapamayan cihazın kaydı en başta reddetmesini
 * sağlıyor — hata kayıt anında görünsün, her kilit açmada değil.
 *
 * `authenticatorAttachment` verilmiyor: kullanıcı isterse telefonunu, isterse
 * bilgisayarının biyometrisini ya da güvenlik anahtarını kullanabilsin.
 */
export async function anahtarOlustur(secenekler: PasskeyRegistrationOptions): Promise<{
  clientDataJSON: string;
  attestationObject: string;
}> {
  const kimlik = (await navigator.credentials.create({
    publicKey: {
      challenge: b64urlCoz(secenekler.challenge),
      rp: { id: secenekler.rpId, name: secenekler.rpName },
      user: {
        // Kullanıcı kimliği UUID metni olarak baytlara çevriliyor; cihazda
        // saklanan değer bu ve e-posta değişse bile sabit kalıyor.
        id: metinBaytlari(secenekler.userId),
        name: secenekler.userName,
        displayName: secenekler.userDisplayName,
      },
      pubKeyCredParams: secenekler.algorithms.map((alg) => ({ type: "public-key" as const, alg })),
      excludeCredentials: secenekler.excludeCredentialIds.map((id) => ({
        type: "public-key" as const,
        id: b64urlCoz(id),
      })),
      authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
      timeout: secenekler.timeoutMs,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!kimlik) throw new Error("Geçiş anahtarı oluşturulamadı");
  const yanit = kimlik.response as AuthenticatorAttestationResponse;
  return {
    clientDataJSON: b64url(yanit.clientDataJSON),
    attestationObject: b64url(yanit.attestationObject),
  };
}

/** Kayıtlı bir geçiş anahtarıyla imza alır (kilidi açmak için). */
export async function anahtarlaImzala(secenekler: PasskeyAuthOptions): Promise<{
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}> {
  const kimlik = (await navigator.credentials.get({
    publicKey: {
      challenge: b64urlCoz(secenekler.challenge),
      rpId: secenekler.rpId,
      allowCredentials: secenekler.allowCredentialIds.map((id) => ({
        type: "public-key" as const,
        id: b64urlCoz(id),
      })),
      userVerification: "required",
      timeout: secenekler.timeoutMs,
    },
  })) as PublicKeyCredential | null;

  if (!kimlik) throw new Error("Doğrulama tamamlanmadı");
  const yanit = kimlik.response as AuthenticatorAssertionResponse;
  return {
    credentialId: kimlik.id,
    clientDataJSON: b64url(yanit.clientDataJSON),
    authenticatorData: b64url(yanit.authenticatorData),
    signature: b64url(yanit.signature),
  };
}

/**
 * Cihazın kendini tanıtması için makul bir ad önerir.
 *
 * Kullanıcıya "cihazına ad ver" diye boş bir alan göstermek, çoğu kişinin boş
 * bıraktığı ve sonra iki anahtarı ayırt edemediği bir alan oluyordu.
 */
export function cihazAdiOner(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Bu cihaz";
}
