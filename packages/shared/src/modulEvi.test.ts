import { test } from "node:test";
import assert from "node:assert/strict";
import { departmaniAcik, modulunEvi } from "./modulEvi";

const yonetim = { id: "y", catalogKey: "yonetim" };

test("departmanı açıksa modül orada", () => {
  assert.equal(modulunEvi(["finans"], [yonetim, { id: "f", catalogKey: "finans" }]), "f");
});

test("birden çok departmanda: anahtar sırası (birincil) kazanır", () => {
  const depts = [{ id: "m", catalogKey: "musteri" }, { id: "s", catalogKey: "satis" }];
  assert.equal(modulunEvi(["satis", "musteri"], depts), "s");
});

test("departmanı yoksa Yönetim'de", () => {
  assert.equal(modulunEvi(["finans"], [yonetim]), "y");
  assert.equal(modulunEvi([], [yonetim]), "y");
});

test("Yönetim de yoksa ev yok; özel departman ev olamaz", () => {
  assert.equal(modulunEvi(["finans"], [{ id: "x", catalogKey: null }]), undefined);
});

test("departmaniAcik Yönetim'e düşüşü saymaz", () => {
  assert.equal(departmaniAcik(["finans"], [yonetim]), false);
  assert.equal(departmaniAcik(["yonetim"], [yonetim]), true);
});
