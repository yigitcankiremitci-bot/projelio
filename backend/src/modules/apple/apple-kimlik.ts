import { createHash, createPublicKey, createVerify, type JsonWebKey } from "node:crypto";

/**
 * Apple kimlik jetonunun (identityToken) doğrulanması — SAF, ağ yok.
 *
 * Jeton iPhone'daki "Apple ile giriş" penceresinden gelir ve istemciden
 * sunucuya taşınır; yani sunucuya ulaşan şey bir İDDİA. Kanıt Apple'ın
 * imzası: imza https://appleid.apple.com/auth/keys'teki anahtarlardan biriyle
 * doğrulanmadan hiçbir alanına güvenilmez (bkz. apple-auth.service.ts
 * anahtarlariGetir).
 *
 * jsonwebtoken / jose bilerek eklenmedi: tek algoritma (RS256), tek yayıncı;
 * node:crypto JWK'yı doğrudan okuyabiliyor. Geçiş anahtarı doğrulaması da
 * aynı gerekçeyle elle yazıldı (common/webauthn).
 */

export const APPLE_YAYINCI = "https://appleid.apple.com";

export interface AppleAnahtari extends JsonWebKey {
  kid?: string;
  alg?: string;
}

export interface AppleKimligi {
  sub: string;
  /** Küçük harfe çevrilmiş e-posta; jeton e-posta taşımıyorsa undefined. */
  email?: string;
  emailVerified: boolean;
  /** "E-postamı gizle" seçildi: adres Apple'ın yönlendirme adresi. */
  ozelEposta: boolean;
}

export class AppleKimlikHatasi extends Error {
  // Parametre özelliği (constructor(public kod)) KULLANILMADI: testler Node'un
  // tip ayıklamasıyla koşuyor ve o sözdizimini desteklemiyor.
  readonly kod: string;
  constructor(kod: string) {
    super(`Apple kimlik jetonu geçersiz: ${kod}`);
    this.kod = kod;
  }
}

/** Saat farkı payı: telefonun ve sunucunun saati tam aynı değil. */
const SAAT_PAYI_SN = 300;

function parcala(jeton: string): { baslik: any; govde: any; imzali: string; imza: Buffer } {
  const parcalar = typeof jeton === "string" ? jeton.split(".") : [];
  if (parcalar.length !== 3) throw new AppleKimlikHatasi("bicim");
  try {
    return {
      baslik: JSON.parse(Buffer.from(parcalar[0], "base64url").toString("utf8")),
      govde: JSON.parse(Buffer.from(parcalar[1], "base64url").toString("utf8")),
      imzali: `${parcalar[0]}.${parcalar[1]}`,
      imza: Buffer.from(parcalar[2], "base64url"),
    };
  } catch {
    throw new AppleKimlikHatasi("bicim");
  }
}

/** Jetonun başlığındaki anahtar kimliği — hangi anahtarın gerektiğini bilmek için. */
export function jetonAnahtarKimligi(jeton: string): string | undefined {
  const kid = parcala(jeton).baslik?.kid;
  return typeof kid === "string" ? kid : undefined;
}

/** İstemcinin ürettiği ham nonce'un Apple'a giden biçimi (SHA-256, hex). */
export function nonceOzeti(hamNonce: string): string {
  return createHash("sha256").update(hamNonce, "utf8").digest("hex");
}

/**
 * Jetonu doğrular ve kimliği döndürür; herhangi bir şart tutmazsa
 * AppleKimlikHatasi fırlatır.
 *
 * `hamNonce`: istemci giriş penceresini açarken rastgele bir değer üretir,
 * ÖZETİNİ Apple'a verir, kendisini sunucuya yollar. Jetondaki `nonce` bu
 * özetle eşleşmeli — ele geçirilmiş eski bir jetonun başka bir istekte
 * yeniden kullanılmasını zorlaştırır. ZORUNLU: verilmezse doğrulama düşer.
 */
export function appleKimliginiDogrula(
  jeton: string,
  anahtarlar: AppleAnahtari[],
  secenek: { izinliAlicilar: string[]; hamNonce: string; simdiSn?: number }
): AppleKimligi {
  const { baslik, govde, imzali, imza } = parcala(jeton);

  if (baslik?.alg !== "RS256") throw new AppleKimlikHatasi("algoritma");
  const anahtar = anahtarlar.find((a) => a.kid === baslik.kid);
  if (!anahtar) throw new AppleKimlikHatasi("anahtar");

  let gecerli = false;
  try {
    const acik = createPublicKey({ key: anahtar, format: "jwk" });
    gecerli = createVerify("RSA-SHA256").update(imzali).verify(acik, imza);
  } catch {
    gecerli = false;
  }
  if (!gecerli) throw new AppleKimlikHatasi("imza");

  if (govde?.iss !== APPLE_YAYINCI) throw new AppleKimlikHatasi("yayinci");
  const alicilar: string[] = Array.isArray(govde?.aud) ? govde.aud : [govde?.aud];
  if (!alicilar.some((a) => secenek.izinliAlicilar.includes(a))) throw new AppleKimlikHatasi("alici");

  const simdi = secenek.simdiSn ?? Math.floor(Date.now() / 1000);
  if (typeof govde?.exp !== "number" || govde.exp + SAAT_PAYI_SN < simdi) throw new AppleKimlikHatasi("suresi-dolmus");
  if (typeof govde?.iat === "number" && govde.iat - SAAT_PAYI_SN > simdi) throw new AppleKimlikHatasi("gelecekte");

  if (!secenek.hamNonce || govde?.nonce !== nonceOzeti(secenek.hamNonce)) throw new AppleKimlikHatasi("nonce");

  if (typeof govde?.sub !== "string" || !govde.sub) throw new AppleKimlikHatasi("sub");

  // Apple bu iki alanı bazen "true" METNİ olarak gönderiyor.
  const dogru = (deger: unknown) => deger === true || deger === "true";
  const email = typeof govde.email === "string" && govde.email ? govde.email.trim().toLowerCase() : undefined;

  return {
    sub: govde.sub,
    email,
    emailVerified: Boolean(email) && dogru(govde.email_verified),
    ozelEposta: dogru(govde.is_private_email),
  };
}
