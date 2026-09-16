import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calculateUsageCost } from "./ai-credits.config";

// Paylaşılan önek (araçlar + statik sistem promptu) ~50 bin token ve tüm
// kullanıcılar için ortak önbellekte duruyor. Yazımının bedeli, önbellek soğukken
// denk gelen kullanıcıya kesilince aynı mesaj bir seferinde 770, birkaç dakika
// sonra 80 kredi tutuyordu. Bu testler o farkın geri gelmemesini korur.

const HAIKU = "claude-haiku-4-5-20251001";
const PREFIX = 50_000;

describe("calculateUsageCost — paylaşılan önek", () => {
  test("soğuk ve sıcak önbellekte kullanıcıya aynı kredi yansır", () => {
    const soguk = calculateUsageCost(HAIKU, { inputTokens: 300, outputTokens: 200, sharedCacheWriteTokens: PREFIX });
    const sicak = calculateUsageCost(HAIKU, { inputTokens: 300, outputTokens: 200, cacheReadTokens: PREFIX });
    assert.equal(soguk.credits, sicak.credits);
    assert.equal(soguk.chargedUsd, sicak.chargedUsd);
  });

  test("gerçek maliyet 1 saatlik yazımın 2× fiyatıyla kaydedilir", () => {
    const { costUsd } = calculateUsageCost(HAIKU, { inputTokens: 0, outputTokens: 0, sharedCacheWriteTokens: PREFIX });
    // 50.000 × 1 USD/milyon × 2
    assert.equal(costUsd, 0.1);
  });

  test("soğuk başlangıçta ilk tur 100 kredinin altında kalır", () => {
    const { credits } = calculateUsageCost(HAIKU, { inputTokens: 500, outputTokens: 400, sharedCacheWriteTokens: PREFIX });
    assert.ok(credits < 100, `ilk tur ${credits} kredi`);
  });

  test("sohbete özgü yazım normal (1,25×) fiyatlanmaya devam eder", () => {
    const yazim = calculateUsageCost(HAIKU, { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 10_000 });
    const duz = calculateUsageCost(HAIKU, { inputTokens: 10_000, outputTokens: 0 });
    assert.ok(yazim.credits > duz.credits);
  });
});
