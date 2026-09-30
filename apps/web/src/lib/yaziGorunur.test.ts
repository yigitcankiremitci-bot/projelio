import test from "node:test";
import assert from "node:assert/strict";
import { kaydirmaMiktari } from "./yaziGorunur";

test("imleç klavyenin altında kalmışsa payla birlikte aşağı kaydırır", () => {
  assert.equal(kaydirmaMiktari(500, 520, 0, 500, 28), 48);
});

test("imleç görünür bölgenin içindeyse kaydırmaz", () => {
  assert.equal(kaydirmaMiktari(200, 220, 0, 500, 28), 0);
});

test("imleç üstte taşmışsa yukarı kaydırır", () => {
  assert.equal(kaydirmaMiktari(-10, 10, 0, 500, 28), -38);
});

test("bölgeden yüksek satırda alt kenar (son kelimeler) önceliklidir", () => {
  assert.equal(kaydirmaMiktari(-100, 600, 0, 500, 28), 128);
});
