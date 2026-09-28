import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ARA_GUN, EN_FAZLA, ESIK, degerlendirmeSorulsunMu, gorevTamamlamaIstegiMi } from "./degerlendirmeIstegi";

const GUN = 24 * 60 * 60 * 1000;
const SIMDI = Date.UTC(2026, 8, 28);

describe("degerlendirmeSorulsunMu", () => {
  it("eşiğe ulaşmadan sormaz", () => {
    assert.equal(degerlendirmeSorulsunMu({ tamamlanan: ESIK - 1, sonSoru: null, soruSayisi: 0 }, SIMDI), false);
  });

  it("eşikte, hiç sorulmamışsa sorar", () => {
    assert.equal(degerlendirmeSorulsunMu({ tamamlanan: ESIK, sonSoru: null, soruSayisi: 0 }, SIMDI), true);
  });

  it("son sorudan beri ara dolmadıysa sormaz, dolunca sorar", () => {
    const yakin = { tamamlanan: 40, sonSoru: SIMDI - (ARA_GUN - 1) * GUN, soruSayisi: 1 };
    const uzak = { tamamlanan: 40, sonSoru: SIMDI - ARA_GUN * GUN, soruSayisi: 1 };
    assert.equal(degerlendirmeSorulsunMu(yakin, SIMDI), false);
    assert.equal(degerlendirmeSorulsunMu(uzak, SIMDI), true);
  });

  it("üst sınıra ulaşınca bir daha hiç sormaz", () => {
    const d = { tamamlanan: 500, sonSoru: SIMDI - 1000 * GUN, soruSayisi: EN_FAZLA };
    assert.equal(degerlendirmeSorulsunMu(d, SIMDI), false);
  });
});

describe("gorevTamamlamaIstegiMi", () => {
  it("görevi tamamlandıya çeken PATCH'i tanır", () => {
    assert.equal(gorevTamamlamaIstegiMi("PATCH", "/tasks/abc", { status: "completed" }), true);
  });

  it("başka durumları, alt yolları ve başka yöntemleri saymaz", () => {
    assert.equal(gorevTamamlamaIstegiMi("PATCH", "/tasks/abc", { status: "todo" }), false);
    assert.equal(gorevTamamlamaIstegiMi("PATCH", "/tasks/abc", { title: "x" }), false);
    assert.equal(gorevTamamlamaIstegiMi("PATCH", "/tasks/abc/comments/1", { status: "completed" }), false);
    assert.equal(gorevTamamlamaIstegiMi("POST", "/tasks/abc", { status: "completed" }), false);
    assert.equal(gorevTamamlamaIstegiMi("PATCH", "/projects/abc", { status: "completed" }), false);
    assert.equal(gorevTamamlamaIstegiMi("PATCH", "/tasks/abc", null), false);
  });
});
