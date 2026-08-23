// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { redactUrl } from "./redact-url";

// Bu adresler hem log'a yazılıyor (all-exceptions.filter) hem de AYNI ODADAKİ
// DİĞER KULLANICILARA gönderiliyor (realtime.interceptor). İkincisi yüzünden
// buradaki bir gerileme, kimlik bilgisini başka birinin tarayıcısına taşır.

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.abcDEF123_-xyz";

describe("redactUrl", () => {
  test("dosya erişim jetonu gizlenir, yol korunur", () => {
    assert.equal(redactUrl(`/files/abc/content?t=${JWT}`), "/files/abc/content?t=***");
  });

  test("OAuth kodu ve state gizlenir", () => {
    assert.equal(
      redactUrl(`/auth/google/callback?code=4/0AX4Xasdf&state=${JWT}&scope=drive`),
      "/auth/google/callback?code=***&state=***&scope=drive"
    );
  });

  test("zararsız parametreler okunabilir kalır — log teşhis için lazım", () => {
    assert.equal(redactUrl("/files/abc/content?download=1"), "/files/abc/content?download=1");
    assert.equal(redactUrl("/blocks/suggestions?from=2026-08-01&to=2026-08-31"), "/blocks/suggestions?from=2026-08-01&to=2026-08-31");
  });

  test("adı tanınmasa da JWT'ye benzeyen değer gizlenir", () => {
    assert.equal(redactUrl(`/bir/uc?bilinmeyen=${JWT}`), "/bir/uc?bilinmeyen=***");
  });

  test("uzun rastgele jeton (hex sıfırlama jetonu) gizlenir", () => {
    const hex = "a".repeat(64);
    assert.equal(redactUrl(`/reset?nonce=${hex}`), "/reset?nonce=***");
  });

  test("URL kodlaması kontrolü atlatamaz", () => {
    // "." yerine %2E: çözülmeden bakılsaydı JWT biçimi tanınmazdı.
    const kodlu = JWT.replace(/\./g, "%2E");
    assert.equal(redactUrl(`/bir/uc?bilinmeyen=${kodlu}`), "/bir/uc?bilinmeyen=***");
  });

  test("query yoksa adres olduğu gibi kalır", () => {
    assert.equal(redactUrl("/projects/123"), "/projects/123");
    assert.equal(redactUrl(""), "");
    assert.equal(redactUrl(undefined), "");
  });
});
