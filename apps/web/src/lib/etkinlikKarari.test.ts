import assert from "node:assert/strict";
import { test } from "node:test";
import { ETKILESIM_ESIGI_MS, sinyalGonderilmeli } from "./etkinlikKarari";

test("görünür sekmede yeni etkileşim varsa sinyal gider", () => {
  assert.equal(sinyalGonderilmeli({ gorunur: true, simdi: 10_000, sonEtkilesim: 9_000 }), true);
});

test("arkadaki sekme sinyal göndermez", () => {
  assert.equal(sinyalGonderilmeli({ gorunur: false, simdi: 10_000, sonEtkilesim: 9_000 }), false);
});

test("eşikten uzun süredir dokunulmayan sekme sinyal göndermez", () => {
  const simdi = 1_000_000;
  assert.equal(sinyalGonderilmeli({ gorunur: true, simdi, sonEtkilesim: simdi - ETKILESIM_ESIGI_MS }), true);
  assert.equal(sinyalGonderilmeli({ gorunur: true, simdi, sonEtkilesim: simdi - ETKILESIM_ESIGI_MS - 1 }), false);
});
