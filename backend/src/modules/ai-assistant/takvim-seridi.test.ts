import * as assert from "node:assert/strict";
import { test } from "node:test";
import { takvimSeridi } from "./takvim-seridi";

test("canlıdaki vaka: 2 Ekim 2026 cuma, 3 Ekim cumartesi", () => {
  const satirlar = takvimSeridi(new Date("2026-10-01T10:00:00Z"), "Europe/Istanbul");
  assert.ok(satirlar.includes("2026-10-01 Perşembe (BUGÜN)"));
  assert.ok(satirlar.includes("2026-10-02 Cuma (yarın)"));
  assert.ok(satirlar.includes("2026-10-03 Cumartesi"));
  assert.ok(satirlar.includes("2026-09-30 Çarşamba (dün)"));
  assert.equal(satirlar.length, 29);
});

test("gece yarısından sonra İstanbul'da gün ilerler (UTC hâlâ dün)", () => {
  // 2026-10-01 22:30 UTC = 2 Ekim 01:30 İstanbul
  const satirlar = takvimSeridi(new Date("2026-10-01T22:30:00Z"), "Europe/Istanbul");
  assert.ok(satirlar.includes("2026-10-02 Cuma (BUGÜN)"));
});

test("ay ve yıl sınırı", () => {
  const satirlar = takvimSeridi(new Date("2026-12-30T09:00:00Z"), "Europe/Istanbul", 0, 3);
  assert.deepEqual(satirlar, [
    "2026-12-30 Çarşamba (BUGÜN)",
    "2026-12-31 Perşembe (yarın)",
    "2027-01-01 Cuma",
    "2027-01-02 Cumartesi",
  ]);
});
