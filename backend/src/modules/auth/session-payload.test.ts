// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isSessionPayload } from "./session-payload";

// Dosya erişim ve OAuth `state` jetonları oturum jetonuyla aynı sırla imzalanıyor
// ve URL'de dolaşıyor; bu ayrım kalkarsa sızan bir jeton tam yetkili oturuma dönüşür.
describe("isSessionPayload", () => {
  test("typ taşımayan yük oturum jetonudur", () => {
    assert.equal(isSessionPayload({ sub: "u1", email: "a@b.c", role: "user" }), true);
  });

  test("özel amaçlı jetonlar oturum sayılmaz", () => {
    for (const typ of ["file_access", "google_oauth", "microsoft_oauth", "instagram_oauth"]) {
      assert.equal(isSessionPayload({ typ }), false, `${typ} reddedilmeliydi`);
    }
  });

  test("boş yük oturum sayılmaz", () => {
    assert.equal(isSessionPayload(null), false);
    assert.equal(isSessionPayload(undefined), false);
  });
});
