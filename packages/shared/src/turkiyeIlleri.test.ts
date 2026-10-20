import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TURKIYE_ILLERI, ilBul, ilSayimi } from "./turkiyeIlleri";

describe("turkiyeIlleri", () => {
  test("81 il, plaka sırasıyla", () => {
    assert.equal(TURKIYE_ILLERI.length, 81);
    TURKIYE_ILLERI.forEach((il, i) => assert.equal(il.plaka, i + 1));
  });
  test("harf ve aksan farkı, il/ilçe yazımı, kısa adlar", () => {
    assert.equal(ilBul("İstanbul")?.plaka, 34);
    assert.equal(ilBul("ISTANBUL")?.plaka, 34);
    assert.equal(ilBul("istanbul/kadıköy")?.plaka, 34);
    assert.equal(ilBul("Kadıköy, İzmir")?.plaka, 35);
    assert.equal(ilBul("Afyon")?.plaka, 3);
    assert.equal(ilBul("K.Maraş")?.plaka, 46);
    assert.equal(ilBul("Iğdır")?.plaka, 76);
    assert.equal(ilBul("ığdır")?.plaka, 76);
  });
  test("tanınmayan ve boş şehir", () => {
    assert.equal(ilBul("Berlin"), undefined);
    assert.equal(ilBul(undefined), undefined);
    const s = ilSayimi([{ c: "Ankara" }, { c: "ankara" }, { c: "" }, { c: "Paris" }], (x) => x.c);
    assert.equal(s.il.get(6), 2);
    assert.equal(s.tanimsiz, 2);
  });
});
