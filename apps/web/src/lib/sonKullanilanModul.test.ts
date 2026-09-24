import { test } from "node:test";
import assert from "node:assert/strict";
import { sonKullanimaGoreSirala } from "./sonKullanilanModul";

const k = (x: { key: string }) => x.key;

test("en son açılan modül en üste çıkar", () => {
  const liste = [{ key: "a" }, { key: "b" }, { key: "c" }];
  const sonuc = sonKullanimaGoreSirala(liste, k, { b: 100, c: 200 });
  assert.deepEqual(sonuc.map(k), ["c", "b", "a"]);
});

test("bu cihazda açılan, sunucuda daha yeni hareketi olanı geçer", () => {
  const liste = [{ key: "a" }, { key: "b" }];
  const sonuc = sonKullanimaGoreSirala(liste, k, { a: Date.parse("2026-09-01") }, { b: "2026-09-20T10:00:00Z" }, Date.parse("2026-09-24"));
  assert.deepEqual(sonuc.map(k), ["a", "b"]);
});

test("açılmamışlar sunucudaki son harekete göre dizilir", () => {
  const liste = [{ key: "a" }, { key: "b" }, { key: "c" }];
  const sonuc = sonKullanimaGoreSirala(liste, k, {}, { a: "2026-08-01T00:00:00Z", c: "2026-09-01T00:00:00Z" }, Date.parse("2026-09-24"));
  assert.deepEqual(sonuc.map(k), ["c", "a", "b"]);
});

test("ileri tarihli sunucu hareketi yok sayılır", () => {
  const liste = [{ key: "a" }, { key: "b" }];
  const sonuc = sonKullanimaGoreSirala(liste, k, {}, { a: "2026-09-30T00:00:00Z", b: "2026-09-01T00:00:00Z" }, Date.parse("2026-09-24"));
  assert.deepEqual(sonuc.map(k), ["b", "a"]);
});

test("hiç kullanılmamışlar gelen sırayı korur", () => {
  const liste = [{ key: "a" }, { key: "b" }, { key: "c" }];
  assert.deepEqual(sonKullanimaGoreSirala(liste, k, {}).map(k), ["a", "b", "c"]);
});

test("bozuk sunucu tarihi sıralamayı bozmaz", () => {
  const liste = [{ key: "a" }, { key: "b" }];
  assert.deepEqual(sonKullanimaGoreSirala(liste, k, { b: 5 }, { a: "geçersiz" }).map(k), ["b", "a"]);
});
