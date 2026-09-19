import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DOGRULAMA_HATIRLATMA_TAVANI, dogrulamaHatirlatmasiGonderilsinMi } from "./dogrulama-hatirlatma";

const SAAT = 3_600_000;
const SIMDI = new Date("2026-09-19T09:00:00Z");
const temel = {
  simdi: SIMDI,
  hesapAcilis: new Date(SIMDI.getTime() - 3 * 24 * SAAT),
  sonHatirlatma: new Date(SIMDI.getTime() - 24 * SAAT),
  gonderilen: 2,
  yerelSaat: 12,
};

test("günde bir gider", () => {
  assert.equal(dogrulamaHatirlatmasiGonderilsinMi(temel), true);
  assert.equal(dogrulamaHatirlatmasiGonderilsinMi({ ...temel, sonHatirlatma: new Date(SIMDI.getTime() - 5 * SAAT) }), false);
  assert.equal(dogrulamaHatirlatmasiGonderilsinMi({ ...temel, sonHatirlatma: null, gonderilen: 0 }), true);
});

test("sabah 10'dan önce gitmez", () => {
  assert.equal(dogrulamaHatirlatmasiGonderilsinMi({ ...temel, yerelSaat: 9 }), false);
});

test("kayıttan hemen sonra, tavandan sonra ve çok eski hesapta gitmez", () => {
  assert.equal(dogrulamaHatirlatmasiGonderilsinMi({ ...temel, hesapAcilis: new Date(SIMDI.getTime() - 5 * SAAT) }), false);
  assert.equal(dogrulamaHatirlatmasiGonderilsinMi({ ...temel, gonderilen: DOGRULAMA_HATIRLATMA_TAVANI }), false);
  assert.equal(dogrulamaHatirlatmasiGonderilsinMi({ ...temel, hesapAcilis: new Date(SIMDI.getTime() - 100 * 24 * SAAT) }), false);
  assert.equal(dogrulamaHatirlatmasiGonderilsinMi({ ...temel, hesapAcilis: null }), false);
});
