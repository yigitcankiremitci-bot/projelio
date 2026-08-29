import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı: namespace import şart.
import * as assert from "node:assert/strict";
import { DemoAiKotasi, DEMO_SAATLIK_KREDI } from "./demo-ai-kotasi";

test("harcama kalan krediden düşer", () => {
  const kota = new DemoAiKotasi();
  assert.equal(kota.kalan(), DEMO_SAATLIK_KREDI);
  kota.harca(500);
  assert.equal(kota.kalan(), DEMO_SAATLIK_KREDI - 500);
});

test("tavan aşılsa bile kalan eksiye düşmez", () => {
  const kota = new DemoAiKotasi();
  kota.harca(DEMO_SAATLIK_KREDI * 3);
  assert.equal(kota.kalan(), 0);
});

test("bir saat geçince pencere kendiliğinden açılır", () => {
  const kota = new DemoAiKotasi();
  const t0 = 1_000_000_000_000;
  kota.harca(DEMO_SAATLIK_KREDI, t0);
  assert.equal(kota.kalan(t0), 0);
  // 59. dakikada hâlâ dolu, 61. dakikada boşalmış olmalı.
  assert.equal(kota.kalan(t0 + 59 * 60_000), 0);
  assert.equal(kota.kalan(t0 + 61 * 60_000), DEMO_SAATLIK_KREDI);
});

test("açılmaya kalan süre dakika olarak bildirilir", () => {
  const kota = new DemoAiKotasi();
  const t0 = 1_000_000_000_000;
  kota.harca(DEMO_SAATLIK_KREDI, t0);
  assert.equal(kota.acilmayaKalanDakika(t0 + 20 * 60_000), 40);
});
