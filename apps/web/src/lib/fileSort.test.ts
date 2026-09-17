import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { matchesSearch, sortFiles, sortFolders } from "./fileSort";

const dosyalar = [
  { name: "dosya10.pdf", createdAt: "2026-09-02T10:00:00Z", sizeBytes: 500 },
  { name: "Çizim.png", createdAt: "2026-09-03T10:00:00Z", sizeBytes: 2000 },
  { name: "dosya2.pdf", createdAt: "2026-09-01T10:00:00Z" },
  { name: "ağaç.jpg", createdAt: "2026-09-04T10:00:00Z", sizeBytes: 100 },
];
const adlar = (list: { name: string }[]) => list.map((f) => f.name);

describe("dosya sıralaması", () => {
  test("eklenme tarihi iki yönde", () => {
    assert.deepEqual(adlar(sortFiles(dosyalar, "date-desc")), ["ağaç.jpg", "Çizim.png", "dosya10.pdf", "dosya2.pdf"]);
    assert.deepEqual(adlar(sortFiles(dosyalar, "date-asc")), ["dosya2.pdf", "dosya10.pdf", "Çizim.png", "ağaç.jpg"]);
  });

  test("ad: Türkçe harfler doğru yerde, sayılar doğal sırada", () => {
    assert.deepEqual(adlar(sortFiles(dosyalar, "name-asc")), ["ağaç.jpg", "Çizim.png", "dosya2.pdf", "dosya10.pdf"]);
    assert.deepEqual(adlar(sortFiles(dosyalar, "name-desc")), ["dosya10.pdf", "dosya2.pdf", "Çizim.png", "ağaç.jpg"]);
  });

  test("boyutu bilinmeyen dosya iki yönde de sonda", () => {
    assert.deepEqual(adlar(sortFiles(dosyalar, "size-desc")), ["Çizim.png", "dosya10.pdf", "ağaç.jpg", "dosya2.pdf"]);
    assert.deepEqual(adlar(sortFiles(dosyalar, "size-asc")), ["ağaç.jpg", "dosya10.pdf", "Çizim.png", "dosya2.pdf"]);
  });

  test("girdi dizisi değişmiyor", () => {
    const once = adlar(dosyalar);
    sortFiles(dosyalar, "name-asc");
    assert.deepEqual(adlar(dosyalar), once);
  });

  test("klasörler yalnızca ad yönüne uyar", () => {
    const klasorler = [{ name: "B" }, { name: "a" }];
    assert.deepEqual(adlar(sortFolders(klasorler, "size-desc")), ["a", "B"]);
    assert.deepEqual(adlar(sortFolders(klasorler, "name-desc")), ["B", "a"]);
  });
});

describe("dosya araması", () => {
  test("büyük/küçük harf ve Türkçe karakter önemsiz", () => {
    assert.ok(matchesSearch("IŞIK Raporu.pdf", "isik"));
    assert.ok(matchesSearch("Çizim.png", "ciz"));
    assert.ok(matchesSearch("İstanbul.docx", "istanbul"));
  });

  test("her kelime geçmeli, sıra önemsiz", () => {
    assert.ok(matchesSearch("2026 Eylül fatura.pdf", "fatura eylul"));
    assert.ok(!matchesSearch("2026 Eylül fatura.pdf", "fatura ekim"));
  });

  test("boş arama her şeyi geçirir", () => {
    assert.ok(matchesSearch("x", "   "));
  });
});
