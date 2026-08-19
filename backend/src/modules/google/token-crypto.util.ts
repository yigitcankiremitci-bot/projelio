import { createTokenCrypto } from "../../common/crypto/token-crypto";

/**
 * Google refresh token'larının şifrelenmesi.
 *
 * Algoritma ve saklama biçimi ortak yardımcıdadır (common/crypto/token-crypto.ts);
 * burada yalnızca Google'ın anahtarı bağlanıyor. Anahtarların entegrasyon başına
 * ayrı olmasının sebebi orada anlatılıyor.
 *
 * Anahtar:  GOOGLE_TOKEN_ENC_KEY  (openssl rand -base64 32)
 */

const crypto = createTokenCrypto("GOOGLE_TOKEN_ENC_KEY");

/** Anahtar yapılandırılmış mı? Google özelliklerini açıp kapatmak için. */
export function isTokenCryptoConfigured(): boolean {
  return crypto.isConfigured();
}

export function encryptToken(plain: string): string {
  return crypto.encrypt(plain);
}

export function decryptToken(stored: string): string {
  return crypto.decrypt(stored);
}
