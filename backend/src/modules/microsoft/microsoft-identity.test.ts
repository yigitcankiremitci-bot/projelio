// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeMicrosoftIdentity } from "./microsoft-identity";

const KISISEL_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

function idToken(payload: Record<string, unknown>): string {
  const govde = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `basliksiz.${govde}.imzasiz`;
}

/**
 * Buradaki asıl mesele hesap devralma: `verifiedEmail` dolu geldiğinde, o
 * adresle VAR OLAN bir Projelio hesabına bağlanılıyor (bkz.
 * MicrosoftAuthService.loginWithMicrosoft). Kiracı yöneticisinin serbestçe
 * yazabildiği bir alan buraya sızarsa, kendi kiracısını açan biri başkasının
 * hesabına girer.
 */
describe("decodeMicrosoftIdentity", () => {
  test("kişisel hesapta email claim'i doğrulanmış sayılır", () => {
    const kimlik = decodeMicrosoftIdentity(
      idToken({ sub: "s1", tid: KISISEL_TENANT, email: "Ali@Outlook.com", name: "Ali" })
    );
    assert.equal(kimlik.email, "ali@outlook.com");
    assert.equal(kimlik.verifiedEmail, "ali@outlook.com");
  });

  test("iş hesabında UPN doğrulanmış sayılır (alan adı Azure'da doğrulanmadan eklenemez)", () => {
    const kimlik = decodeMicrosoftIdentity(
      idToken({ sub: "s2", tid: "kiraci-1", preferred_username: "Ayse@Sirket.com" })
    );
    assert.equal(kimlik.verifiedEmail, "ayse@sirket.com");
  });

  test("iş hesabında serbest yazılabilen mail adresi doğrulanmış SAYILMAZ", () => {
    // Saldırgan kendi kiracısında `mail` özniteliğine kurbanın adresini yazdı.
    const kimlik = decodeMicrosoftIdentity(
      idToken({ sub: "s3", tid: "kiraci-2", email: "kurban@gmail.com" })
    );
    assert.equal(kimlik.email, "kurban@gmail.com");
    assert.equal(kimlik.verifiedEmail, undefined);
  });

  test("xms_edov true ise email claim'i doğrulanmış sayılır", () => {
    const kimlik = decodeMicrosoftIdentity(
      idToken({ sub: "s4", tid: "kiraci-3", email: "veli@sirket.com", xms_edov: true })
    );
    assert.equal(kimlik.verifiedEmail, "veli@sirket.com");
  });

  test("e-posta hiç yoksa reddedilir", () => {
    assert.throws(() => decodeMicrosoftIdentity(idToken({ sub: "s5", tid: "kiraci-4" })), /e-postası alınamadı/);
  });

  test("sub yoksa reddedilir", () => {
    assert.throws(() => decodeMicrosoftIdentity(idToken({ email: "a@b.c" })), /kimlik bilgisi eksik/);
  });
});
