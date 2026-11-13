// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createSign, generateKeyPairSync } from "node:crypto";
import { APPLE_YAYINCI, AppleKimlikHatasi, appleKimliginiDogrula, nonceOzeti, type AppleAnahtari } from "./apple-kimlik";

/**
 * Asıl mesele hesap devralma: doğrulanmış sayılan e-posta, o adresle VAR OLAN
 * Projelio hesabına bağlanıyor (AppleAuthService.girisYap). Sahte bir jeton
 * buradan geçerse başkasının hesabına girilir.
 */
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ANAHTAR: AppleAnahtari = { ...(publicKey.export({ format: "jwk" }) as object), kid: "k1", alg: "RS256" };
const BASKA = generateKeyPairSync("rsa", { modulusLength: 2048 });

const SIMDI = 1_800_000_000;
const NONCE = "ham-nonce-123";
const SECENEK = { izinliAlicilar: ["app.projelio.mobile"], hamNonce: NONCE, simdiSn: SIMDI };

function jeton(govde: Record<string, unknown>, baslik: Record<string, unknown> = {}, imzalayan = privateKey): string {
  const b = Buffer.from(JSON.stringify({ alg: "RS256", kid: "k1", ...baslik })).toString("base64url");
  const g = Buffer.from(JSON.stringify(govde)).toString("base64url");
  const imza = createSign("RSA-SHA256").update(`${b}.${g}`).sign(imzalayan).toString("base64url");
  return `${b}.${g}.${imza}`;
}

const GECERLI = {
  iss: APPLE_YAYINCI,
  aud: "app.projelio.mobile",
  exp: SIMDI + 600,
  iat: SIMDI,
  sub: "001234.abc",
  email: "Ali@Example.com",
  email_verified: "true",
  is_private_email: "false",
  nonce: nonceOzeti(NONCE),
};

function hataKodu(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof AppleKimlikHatasi ? e.kod : "baska";
  }
  return undefined;
}

describe("appleKimliginiDogrula", () => {
  test("geçerli jeton: kimlik ve küçük harfli e-posta döner", () => {
    const k = appleKimliginiDogrula(jeton(GECERLI), [ANAHTAR], SECENEK);
    assert.deepEqual(k, { sub: "001234.abc", email: "ali@example.com", emailVerified: true, ozelEposta: false });
  });

  test("başka anahtarla imzalanmış jeton reddedilir", () => {
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton(GECERLI, {}, BASKA.privateKey), [ANAHTAR], SECENEK)), "imza");
  });

  test("gövdesi sonradan değiştirilmiş jeton reddedilir", () => {
    const [b, , i] = jeton(GECERLI).split(".");
    const sahte = Buffer.from(JSON.stringify({ ...GECERLI, email: "kurban@example.com" })).toString("base64url");
    assert.equal(hataKodu(() => appleKimliginiDogrula(`${b}.${sahte}.${i}`, [ANAHTAR], SECENEK)), "imza");
  });

  test("bilinmeyen anahtar kimliği reddedilir", () => {
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton(GECERLI, { kid: "yok" }), [ANAHTAR], SECENEK)), "anahtar");
  });

  test("RS256 dışı algoritma reddedilir", () => {
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton(GECERLI, { alg: "none" }), [ANAHTAR], SECENEK)), "algoritma");
  });

  test("başka uygulamaya verilmiş jeton (aud) reddedilir", () => {
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton({ ...GECERLI, aud: "com.baska.app" }), [ANAHTAR], SECENEK)), "alici");
  });

  test("yayıncı Apple değilse reddedilir", () => {
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton({ ...GECERLI, iss: "https://sahte" }), [ANAHTAR], SECENEK)), "yayinci");
  });

  test("süresi dolmuş jeton reddedilir, saat payı içindeki kabul edilir", () => {
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton({ ...GECERLI, exp: SIMDI - 301 }), [ANAHTAR], SECENEK)), "suresi-dolmus");
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton({ ...GECERLI, exp: SIMDI - 100 }), [ANAHTAR], SECENEK)), undefined);
  });

  test("nonce eşleşmezse ya da verilmezse reddedilir", () => {
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton(GECERLI), [ANAHTAR], { ...SECENEK, hamNonce: "baska" })), "nonce");
    assert.equal(hataKodu(() => appleKimliginiDogrula(jeton(GECERLI), [ANAHTAR], { ...SECENEK, hamNonce: "" })), "nonce");
  });

  test("email_verified yoksa e-posta doğrulanmış sayılmaz", () => {
    const { email_verified: _, ...govde } = GECERLI;
    assert.equal(appleKimliginiDogrula(jeton(govde), [ANAHTAR], SECENEK).emailVerified, false);
  });

  test("e-postasız jeton: email yok, doğrulanmış değil", () => {
    const { email: _, ...govde } = GECERLI;
    const k = appleKimliginiDogrula(jeton(govde), [ANAHTAR], SECENEK);
    assert.equal(k.email, undefined);
    assert.equal(k.emailVerified, false);
  });

  test("gizli e-posta işareti boolean olarak da okunur", () => {
    assert.equal(appleKimliginiDogrula(jeton({ ...GECERLI, is_private_email: true }), [ANAHTAR], SECENEK).ozelEposta, true);
  });

  test("bozuk biçim reddedilir", () => {
    assert.equal(hataKodu(() => appleKimliginiDogrula("abc", [ANAHTAR], SECENEK)), "bicim");
  });
});
