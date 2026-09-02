// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_RATE_LIMIT,
  dailyCapForWarmup,
  decideSend,
  isQuietHour,
  jitterMs,
  nextRetryAt,
  rateLimitFromEnv,
  type SendWindowFacts,
} from "./whatsapp-rate-limit";

const now = new Date("2026-09-02T12:00:00+03:00");

function facts(overrides: Partial<SendWindowFacts> = {}): SendWindowFacts {
  return {
    sentLastMinute: 0,
    sentLastHour: 0,
    sentToday: 0,
    sentToContactToday: 0,
    warmupStartedAt: new Date(now.getTime() - 30 * 86_400_000),
    pausedUntil: null,
    localHour: 12,
    now,
    ...overrides,
  };
}

describe("ısınma merdiveni", () => {
  test("ilk gün, üçüncü gün, ısınma bitince", () => {
    const start = now;
    assert.equal(dailyCapForWarmup(DEFAULT_RATE_LIMIT, start, now), 20);
    const day3 = new Date(now.getTime() + 2 * 86_400_000);
    assert.equal(dailyCapForWarmup(DEFAULT_RATE_LIMIT, start, day3), Math.floor(20 * 1.8 * 1.8));
    const day8 = new Date(now.getTime() + 7 * 86_400_000);
    assert.equal(dailyCapForWarmup(DEFAULT_RATE_LIMIT, start, day8), DEFAULT_RATE_LIMIT.perDay);
  });

  test("hiç bağlanmamışsa ilk gün sayılır", () => {
    assert.equal(dailyCapForWarmup(DEFAULT_RATE_LIMIT, null, now), 20);
  });
});

describe("sessiz saat", () => {
  test("gece yarısını aşan aralık", () => {
    assert.equal(isQuietHour(DEFAULT_RATE_LIMIT, 23), true);
    assert.equal(isQuietHour(DEFAULT_RATE_LIMIT, 3), true);
    assert.equal(isQuietHour(DEFAULT_RATE_LIMIT, 8), false);
    assert.equal(isQuietHour(DEFAULT_RATE_LIMIT, 12), false);
    assert.equal(isQuietHour(DEFAULT_RATE_LIMIT, 21), false);
  });

  test("eşit sınır = sessiz saat yok", () => {
    assert.equal(isQuietHour({ ...DEFAULT_RATE_LIMIT, quietHoursStart: 0, quietHoursEnd: 0 }, 3), false);
  });
});

describe("gönderim kararı", () => {
  test("temiz durumda izin", () => {
    assert.deepEqual(decideSend(DEFAULT_RATE_LIMIT, facts()), { allowed: true });
  });

  test("duraklatılmış bağlantı önce gelir", () => {
    const paused = facts({ pausedUntil: new Date(now.getTime() + 1000), localHour: 23 });
    assert.deepEqual(decideSend(DEFAULT_RATE_LIMIT, paused), { allowed: false, reason: "paused" });
  });

  test("süresi geçmiş duraklama sayılmaz", () => {
    const paused = facts({ pausedUntil: new Date(now.getTime() - 1000) });
    assert.deepEqual(decideSend(DEFAULT_RATE_LIMIT, paused), { allowed: true });
  });

  test("tavanlar sırayla", () => {
    assert.equal(decideSend(DEFAULT_RATE_LIMIT, facts({ localHour: 23 })).allowed, false);
    assert.deepEqual(decideSend(DEFAULT_RATE_LIMIT, facts({ sentLastMinute: 8 })), { allowed: false, reason: "per_minute" });
    assert.deepEqual(decideSend(DEFAULT_RATE_LIMIT, facts({ sentLastHour: 200 })), { allowed: false, reason: "per_hour" });
    assert.deepEqual(decideSend(DEFAULT_RATE_LIMIT, facts({ sentToday: 1500 })), { allowed: false, reason: "per_day" });
    assert.deepEqual(decideSend(DEFAULT_RATE_LIMIT, facts({ sentToContactToday: 20 })), { allowed: false, reason: "per_contact" });
  });

  test("ısınma günündeki tavan günlük limitin önüne geçer", () => {
    const fresh = facts({ warmupStartedAt: now, sentToday: 20 });
    assert.deepEqual(decideSend(DEFAULT_RATE_LIMIT, fresh), { allowed: false, reason: "per_day" });
  });
});

describe("yardımcılar", () => {
  test("jitter aralıkta", () => {
    assert.equal(jitterMs(DEFAULT_RATE_LIMIT, () => 0), 2000);
    assert.equal(jitterMs(DEFAULT_RATE_LIMIT, () => 0.999), 7994);
  });

  test("tekrar deneme takvimi", () => {
    assert.equal(nextRetryAt(1, now)?.getTime(), now.getTime() + 60_000);
    assert.equal(nextRetryAt(2, now)?.getTime(), now.getTime() + 5 * 60_000);
    assert.equal(nextRetryAt(3, now)?.getTime(), now.getTime() + 30 * 60_000);
    assert.equal(nextRetryAt(4, now), null);
  });

  test("env okuma: geçersiz değer varsayılana düşer", () => {
    const cfg = rateLimitFromEnv({ WHATSAPP_RATE_PER_MINUTE: "3", WHATSAPP_RATE_PER_DAY: "abc" });
    assert.equal(cfg.perMinute, 3);
    assert.equal(cfg.perDay, DEFAULT_RATE_LIMIT.perDay);
  });
});
