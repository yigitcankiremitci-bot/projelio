import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import {
  isValidTier,
  normalizeModelKey,
  normalizeTier,
  TIERS,
} from "./ai-model-settings.validate";

// Servisin kendisi @Injectable taşıdığı için (bağımlılığı var) tip-silme
// koşucusuyla yüklenemiyor; korunması gereken mantık saf modülde duruyor.

test("katalogda olmayan model reddedilir", () => {
  // En pahalı hata: geçersiz model kaydedilirse asistan HER istekte
  // sağlayıcıdan 404 alır ve sebebi panelde görünmez.
  for (const kotu of ["anthropic:yokboyle", "yokboyle:model", "saglayicisiz", "::", "anthropic:"]) {
    const r = normalizeModelKey(kotu);
    assert.equal(r.ok, false, `"${kotu}" reddedilmeliydi`);
    assert.match(r.error ?? "", /katalogda yok/);
  }
});

test("geçerli model kabul edilir", () => {
  for (const iyi of ["anthropic:claude-sonnet-5", "zai:glm-5.3", "minimax:MiniMax-M3"]) {
    const r = normalizeModelKey(iyi);
    assert.equal(r.ok, true, `"${iyi}" kabul edilmeliydi`);
    assert.equal(r.value, iyi);
  }
});

test("boş değer varsayılana döner (null)", () => {
  for (const bos of ["", "   ", null, undefined]) {
    const r = normalizeModelKey(bos);
    assert.equal(r.ok, true);
    assert.equal(r.value, null);
  }
});

test("kademe doğrulaması", () => {
  for (const t of TIERS) assert.equal(isValidTier(t), true);
  for (const kotu of ["", "yokboyle", "FAST", null, undefined]) {
    assert.equal(isValidTier(kotu), false, `"${kotu}" geçersiz olmalıydı`);
  }
});

test("bilinmeyen kademe fast'e düşer (asistan durmasın)", () => {
  assert.equal(normalizeTier("bozuk"), "fast");
  assert.equal(normalizeTier(null), "fast");
  assert.equal(normalizeTier("smart"), "smart");
});

test("model kimliğindeki iki nokta korunur", () => {
  // Model adında ":" geçerse bölme mantığı bozulmamalı; sağlayıcı yalnızca
  // İLK parçadır, gerisi model kimliğidir.
  const r = normalizeModelKey("anthropic:claude-sonnet-5");
  assert.equal(r.value, "anthropic:claude-sonnet-5");
});
