import { createTokenCrypto } from "../../common/crypto/token-crypto";

/**
 * Microsoft refresh token'larının şifrelenmesi.
 *
 * Algoritma ve saklama biçimi ortak yardımcıdadır (common/crypto/token-crypto.ts);
 * burada yalnızca Microsoft'un anahtarı bağlanıyor — iki sağlayıcının anahtarları
 * birbirinden bağımsız olsun ki biri sızarsa/döndürülse diğeri etkilenmesin.
 *
 * Anahtar:  MICROSOFT_TOKEN_ENC_KEY  (openssl rand -base64 32)
 */

const crypto = createTokenCrypto("MICROSOFT_TOKEN_ENC_KEY");

/** Anahtar yapılandırılmış mı? Microsoft/OneDrive özelliklerini açıp kapatmak için. */
export function isMicrosoftTokenCryptoConfigured(): boolean {
  return crypto.isConfigured();
}

export function encryptMicrosoftToken(plain: string): string {
  return crypto.encrypt(plain);
}

export function decryptMicrosoftToken(stored: string): string {
  return crypto.decrypt(stored);
}
