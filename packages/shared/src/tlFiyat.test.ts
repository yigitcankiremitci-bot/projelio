import { strict as assert } from "node:assert";
import { test } from "node:test";
import { tlFiyat } from "./tlFiyat";

test("10 ₺'nin katına yukarı yuvarlar", () => {
  // 18.09.2026 Ziraat satış kuru; paket fiyatlarıyla (billing.plans.ts).
  assert.equal(tlFiyat(4.99, 49.2663), 250);
  assert.equal(tlFiyat(9.99, 49.2663), 500);
  assert.equal(tlFiyat(24.99, 49.2663), 1240);
  assert.equal(tlFiyat(49.9, 49.2663), 2460);
});

test("tam kattaki tutar bir basamak atlamaz", () => {
  assert.equal(tlFiyat(10, 50), 500);
  assert.equal(tlFiyat(0.1 + 0.2, 100), 30);
});

test("geçersiz girdide null", () => {
  assert.equal(tlFiyat(0, 50), null);
  assert.equal(tlFiyat(5, 0), null);
  assert.equal(tlFiyat(Number.NaN, 50), null);
});
