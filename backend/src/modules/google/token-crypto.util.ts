import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Google refresh token'larının şifrelenmesi.
 *
 * Refresh token, kullanıcının Drive'ına süresiz erişim demektir ve veritabanında
 * düz metin durursa bir dump sızıntısı doğrudan tüm kullanıcıların dosyalarına
 * erişim anlamına gelir. Bu yüzden token'lar uygulama katmanında AES-256-GCM ile
 * şifrelenir; anahtar veritabanında değil ortam değişkeninde tutulur.
 *
 * GCM seçildi çünkü sadece gizlilik değil bütünlük de sağlar: şifreli metin
 * kurcalanırsa çözme işlemi sessizce bozuk veri döndürmek yerine hata verir.
 *
 * Saklama biçimi:  v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
 * Sürüm öneki ileride anahtar/algoritma değişirse eski kayıtları tanımak için.
 */

const FORMAT_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM için önerilen uzunluk

let cachedKey: Buffer | null = null;

/**
 * Şifreleme anahtarını ortamdan okur. Anahtar 32 baytlık base64 bir değerdir:
 *   openssl rand -base64 32
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.GOOGLE_TOKEN_ENC_KEY?.trim();
  if (!raw) {
    throw new Error(
      "GOOGLE_TOKEN_ENC_KEY tanımlı değil. 32 baytlık bir anahtar üretin: openssl rand -base64 32"
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `GOOGLE_TOKEN_ENC_KEY 32 bayt olmalı (base64 çözüldüğünde), şu an ${key.length} bayt.`
    );
  }

  cachedKey = key;
  return key;
}

/** Anahtar yapılandırılmış mı? Google özelliklerini açıp kapatmak için. */
export function isTokenCryptoConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptToken(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error("Şifreli token biçimi tanınmıyor");
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
