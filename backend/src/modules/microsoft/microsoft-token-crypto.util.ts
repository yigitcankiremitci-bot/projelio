import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Microsoft refresh token'larının şifrelenmesi.
 *
 * google/token-crypto.util.ts ile birebir aynı şema (AES-256-GCM, aynı saklama
 * biçimi) ama BİLEREK ayrı bir anahtarla (MICROSOFT_TOKEN_ENC_KEY): iki
 * sağlayıcının anahtarları birbirinden bağımsız olsun ki biri sızarsa/döndürülse
 * diğeri etkilenmesin.
 *
 * Saklama biçimi:  v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
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

  const raw = process.env.MICROSOFT_TOKEN_ENC_KEY?.trim();
  if (!raw) {
    throw new Error(
      "MICROSOFT_TOKEN_ENC_KEY tanımlı değil. 32 baytlık bir anahtar üretin: openssl rand -base64 32"
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `MICROSOFT_TOKEN_ENC_KEY 32 bayt olmalı (base64 çözüldüğünde), şu an ${key.length} bayt.`
    );
  }

  cachedKey = key;
  return key;
}

/** Anahtar yapılandırılmış mı? Microsoft/OneDrive özelliklerini açıp kapatmak için. */
export function isMicrosoftTokenCryptoConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptMicrosoftToken(plain: string): string {
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

export function decryptMicrosoftToken(stored: string): string {
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
