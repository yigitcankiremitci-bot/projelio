// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { oturumKarari, utcMs } from "./oturum-engeli";

test("kaydı olmayan hesap geçerli", () => {
  assert.equal(oturumKarari(undefined, 1000), "gecerli");
});

test("askıya alınmış hesap, oturum ne zaman başlamış olursa olsun reddedilir", () => {
  const kayit = { bannedAt: 5_000, sessionsRevokedAt: null };
  assert.equal(oturumKarari(kayit, 1), "askida");
  assert.equal(oturumKarari(kayit, 9_999_999), "askida");
});

test("iptalden önce başlamış oturum reddedilir, sonra başlayan geçer", () => {
  const kayit = { bannedAt: null, sessionsRevokedAt: 100_000 };
  assert.equal(oturumKarari(kayit, 99), "oturum_iptal");
  assert.equal(oturumKarari(kayit, 101), "gecerli");
});

test("iptalle aynı saniyede başlamış oturum reddedilir", () => {
  assert.equal(oturumKarari({ bannedAt: null, sessionsRevokedAt: 100_500 }, 100), "oturum_iptal");
});

test("loginAt taşımayan eski jeton, iptal varsa reddedilir", () => {
  assert.equal(oturumKarari({ bannedAt: null, sessionsRevokedAt: 1 }, undefined), "oturum_iptal");
});

test("saat dilimsiz zaman damgası UTC sayılır", () => {
  assert.equal(utcMs("2026-09-12T10:00:00"), Date.UTC(2026, 8, 12, 10));
  assert.equal(utcMs("2026-09-12T10:00:00.123"), Date.UTC(2026, 8, 12, 10, 0, 0, 123));
  assert.equal(utcMs("2026-09-12T13:00:00+03:00"), Date.UTC(2026, 8, 12, 10));
  assert.equal(utcMs(null), null);
});
