// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { consumeRateLimit, resetRateLimitStore } from "./rate-limit.store";

describe("consumeRateLimit", () => {
  beforeEach(() => resetRateLimitStore());

  test("sınıra kadar kabul eder, sonrasını reddeder", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      assert.equal(consumeRateLimit("a", 3, 1000, now), true, `${i + 1}. istek geçmeliydi`);
    }
    assert.equal(consumeRateLimit("a", 3, 1000, now), false);
  });

  test("pencere dolunca sayaç sıfırlanır", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) consumeRateLimit("a", 3, 1000, now);
    assert.equal(consumeRateLimit("a", 3, 1000, now + 1001), true);
  });

  test("anahtarlar birbirinden bağımsızdır", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) consumeRateLimit("a", 3, 1000, now);
    assert.equal(consumeRateLimit("a", 3, 1000, now), false);
    assert.equal(consumeRateLimit("b", 3, 1000, now), true);
  });
});
