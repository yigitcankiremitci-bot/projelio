// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ABSOLUTE_SESSION_MAX_MS, absoluteSessionExpired, isSessionPayload, nowInSeconds } from "./session-payload";

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

// Kayan oturumun üst sınırı. Bu olmadan, jetonu çalan biri /auth/refresh'i düzenli
// çağırarak oturumu sonsuza kadar uzatabiliyordu.
describe("absoluteSessionExpired", () => {
  const gun = 24 * 60 * 60;

  test("sınır dolmadan yenilemeye izin verir", () => {
    const simdi = nowInSeconds();
    assert.equal(absoluteSessionExpired(simdi - 29 * gun, simdi), false);
  });

  test("sınır dolduktan sonra reddeder", () => {
    const simdi = nowInSeconds();
    assert.equal(absoluteSessionExpired(simdi - 31 * gun, simdi), true);
  });

  test("loginAt yoksa reddetmez — eski jetonlar bir anda çıkışa düşmesin", () => {
    assert.equal(absoluteSessionExpired(undefined), false);
  });

  test("sınır 30 gün", () => {
    assert.equal(ABSOLUTE_SESSION_MAX_MS, 30 * 24 * 60 * 60 * 1000);
  });
});

describe("loginAt oturum jetonu olmasını bozmaz", () => {
  test("loginAt taşıyan yük hâlâ oturum jetonudur", () => {
    assert.equal(isSessionPayload({ sub: "u1", email: "a@b.c", role: "user", loginAt: 123 }), true);
  });
});

// Habie'ye verilen devir jetonu: normal bir oturum jetonu (API'ye erişmesi
// gerekiyor) ama yenilenemez olmalı, yoksa 30 dakikalık devir 7 günlük oturuma
// dönüşür. Bu yüzden `agent` alanı isSessionPayload'ı BOZMAMALI.
describe("agent (devir) jetonu", () => {
  test("agent işareti taşıyan yük hâlâ oturum jetonudur", () => {
    assert.equal(isSessionPayload({ sub: "u1", email: "a@b.c", role: "user", agent: true }), true);
  });

  test("typ taşıyan özel amaçlı jeton hâlâ oturum sayılmaz", () => {
    assert.equal(isSessionPayload({ sub: "u1", email: "a@b.c", role: "user", typ: "file_access" }), false);
  });
});
