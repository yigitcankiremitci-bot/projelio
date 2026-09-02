// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeWebhookSignature, verifyWebhookSignature } from "./whatsapp-webhook-signature";

const key = "test-hmac-key-0123456789";
const body = Buffer.from(JSON.stringify({ event: "message", payload: { body: "merhaba" } }));

describe("webhook imzası", () => {
  test("doğru imza geçer", () => {
    const sig = computeWebhookSignature(body, key);
    assert.equal(verifyWebhookSignature({ rawBody: body, key, signatureHeader: sig, algorithmHeader: "sha512" }), true);
  });

  test("algoritma başlığı yoksa sha512 varsayılır", () => {
    const sig = computeWebhookSignature(body, key);
    assert.equal(verifyWebhookSignature({ rawBody: body, key, signatureHeader: sig }), true);
  });

  test("sha256 de kabul", () => {
    const sig = computeWebhookSignature(body, key, "sha256");
    assert.equal(verifyWebhookSignature({ rawBody: body, key, signatureHeader: sig, algorithmHeader: "sha256" }), true);
  });

  test("gövde değişince düşer", () => {
    const sig = computeWebhookSignature(body, key);
    const tampered = Buffer.from(body.toString().replace("merhaba", "DUR"));
    assert.equal(verifyWebhookSignature({ rawBody: tampered, key, signatureHeader: sig }), false);
  });

  test("yanlış anahtar, boş imza, bilinmeyen algoritma, eksik gövde", () => {
    const sig = computeWebhookSignature(body, key);
    assert.equal(verifyWebhookSignature({ rawBody: body, key: "baska", signatureHeader: sig }), false);
    assert.equal(verifyWebhookSignature({ rawBody: body, key, signatureHeader: "" }), false);
    assert.equal(verifyWebhookSignature({ rawBody: body, key, signatureHeader: sig, algorithmHeader: "md5" }), false);
    assert.equal(verifyWebhookSignature({ rawBody: undefined, key, signatureHeader: sig }), false);
    assert.equal(verifyWebhookSignature({ rawBody: body, key, signatureHeader: "zz" }), false);
  });
});
