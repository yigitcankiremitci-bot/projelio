import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PARCA_BOYUTU, parcalara } from "./parcali-liste";

// Bu sınır sessiz: küçük hesapta hiç görünmüyor, veri büyüyünce sorgu
// aniden düşüyor ve hata "URL çok uzun" değil anlamsız bir 500 oluyor.

describe("parcalara", () => {
  test("liste boyutu aşınca bölünür", () => {
    assert.deepEqual(parcalara([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  test("sığan liste tek parça kalır", () => {
    assert.deepEqual(parcalara([1, 2], 5), [[1, 2]]);
  });

  test("boş liste hiç sorgu üretmesin diye boş dizi döner", () => {
    assert.deepEqual(parcalara([], 5), []);
  });

  test("tam bölünen listede boş parça kalmaz", () => {
    assert.deepEqual(parcalara([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  });

  test("varsayılan boyut makul", () => {
    assert.equal(parcalara(Array.from({ length: 120 }, (_, i) => i)).length, Math.ceil(120 / PARCA_BOYUTU));
  });

  test("geçersiz boyut sessizce sonsuz döngüye girmez", () => {
    assert.throws(() => parcalara([1], 0));
  });
});
