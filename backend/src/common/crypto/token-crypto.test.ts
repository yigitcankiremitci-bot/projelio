// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import { createTokenCrypto } from "./token-crypto";

// Jeton şifreleme, sızıntı anında son savunma hattı. Buradaki bir hata sessiz
// olur: yanlış şifrelenen bir jeton da "şifreli" görünür.

const KEY_VAR = "TEST_TOKEN_ENC_KEY";
process.env[KEY_VAR] = randomBytes(32).toString("base64");

describe("token şifreleme", () => {
  const crypto = createTokenCrypto(KEY_VAR);

  test("şifreleme geri döndürülebilir", () => {
    const secret = "IGQVJYb2hs...uzun-bir-instagram-jetonu";
    assert.equal(crypto.decrypt(crypto.encrypt(secret)), secret);
  });

  test("aynı metin her seferinde farklı şifreleniyor", () => {
    // IV rastgele: aynı jetonun iki kaydı veritabanında birbirine benzemez,
    // "bu iki hesap aynı jetonu kullanıyor" çıkarımı yapılamaz.
    assert.notEqual(crypto.encrypt("aynı"), crypto.encrypt("aynı"));
  });

  test("türkçe karakter ve uzun metin bozulmuyor", () => {
    const text = "şĞİıöçü ".repeat(500);
    assert.equal(crypto.decrypt(crypto.encrypt(text)), text);
  });

  test("kurcalanan şifreli metin hata verir, bozuk veri döndürmez", () => {
    const stored = crypto.encrypt("gizli");
    const [version, iv, tag, data] = stored.split(".");
    // Son baytı değiştir: GCM doğrulama etiketi tutmaz.
    const tampered = Buffer.from(data, "base64");
    tampered[tampered.length - 1] ^= 0xff;
    assert.throws(() => crypto.decrypt([version, iv, tag, tampered.toString("base64")].join(".")));
  });

  test("tanınmayan biçim reddedilir", () => {
    assert.throws(() => crypto.decrypt("düz-metin"), /biçimi tanınmıyor/);
    assert.throws(() => crypto.decrypt("v2.a.b.c"), /biçimi tanınmıyor/);
  });

  test("başka anahtarla çözülemez", () => {
    process.env.OTHER_KEY = randomBytes(32).toString("base64");
    const other = createTokenCrypto("OTHER_KEY");
    assert.throws(() => other.decrypt(crypto.encrypt("gizli")));
  });

  test("anahtar yoksa/kısaysa yapılandırılmamış sayılır", () => {
    assert.equal(createTokenCrypto("YOK_BOYLE_BIR_DEGISKEN").isConfigured(), false);

    process.env.SHORT_KEY = Buffer.from("kısa").toString("base64");
    const short = createTokenCrypto("SHORT_KEY");
    assert.equal(short.isConfigured(), false);
    assert.throws(() => short.encrypt("x"), /32 bayt olmalı/);
  });
});
