import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Üçüncü taraf erişim jetonlarının şifrelenmesi.
 *
 * Bir refresh/erişim jetonu, kullanıcının o platformdaki hesabına erişim
 * demektir; veritabanında düz metin dururlarsa tek bir dump sızıntısı bütün
 * kullanıcıların Drive'ına ya da Instagram hesabına erişim anlamına gelir. Bu
 * yüzden jetonlar uygulama katmanında AES-256-GCM ile şifrelenir; anahtar
 * veritabanında değil ortam değişkeninde tutulur.
 *
 * GCM seçildi çünkü sadece gizlilik değil bütünlük de sağlar: şifreli metin
 * kurcalanırsa çözme işlemi sessizce bozuk veri döndürmek yerine hata verir.
 *
 * Saklama biçimi:  v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>
 * Sürüm öneki ileride anahtar/algoritma değişirse eski kayıtları tanımak için.
 *
 * HER ENTEGRASYONUN KENDİ ANAHTARI VAR (fabrika bu yüzden env adı alıyor):
 * Google Drive anahtarı sızarsa Instagram jetonları etkilenmemeli, anahtarlar
 * ayrı ayrı döndürülebilmeli. Algoritma ortak, sır ayrı.
 */

const FORMAT_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM için önerilen uzunluk

export interface TokenCrypto {
  /** Anahtar yapılandırılmış mı? Entegrasyonu açıp kapatmak için. */
  isConfigured(): boolean;
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

/**
 * Verilen ortam değişkenini anahtar olarak kullanan bir şifreleyici üretir.
 *
 * Anahtar 32 baytlık base64 bir değerdir:  openssl rand -base64 32
 */
export function createTokenCrypto(envVarName: string): TokenCrypto {
  let cachedKey: Buffer | null = null;

  function getKey(): Buffer {
    if (cachedKey) return cachedKey;

    const raw = process.env[envVarName]?.trim();
    if (!raw) {
      throw new Error(`${envVarName} tanımlı değil. 32 baytlık bir anahtar üretin: openssl rand -base64 32`);
    }

    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error(`${envVarName} 32 bayt olmalı (base64 çözüldüğünde), şu an ${key.length} bayt.`);
    }

    cachedKey = key;
    return key;
  }

  return {
    isConfigured() {
      try {
        getKey();
        return true;
      } catch {
        return false;
      }
    },

    encrypt(plain: string): string {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, getKey(), iv);
      const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return [FORMAT_VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
        "."
      );
    },

    decrypt(stored: string): string {
      const parts = stored.split(".");
      if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
        throw new Error("Şifreli token biçimi tanınmıyor");
      }

      const [, ivB64, tagB64, dataB64] = parts;
      const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));

      return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
    },
  };
}
