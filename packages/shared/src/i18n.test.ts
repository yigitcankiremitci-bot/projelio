import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTranslator,
  dictKey,
  isLocale,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  type TranslationDict,
} from "./i18n";

test("normalizeLocale bölgeli etiketi ana dile indirger", () => {
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale("TR"), "tr");
  assert.equal(normalizeLocale("tr_TR"), "tr");
  assert.equal(normalizeLocale("de-DE"), null);
  assert.equal(normalizeLocale(""), null);
  assert.equal(normalizeLocale(undefined), null);
});

test("resolveLocale ilk tanınan adayı seçer, yoksa Türkçeye düşer", () => {
  assert.equal(resolveLocale([null, "de", "en-GB"]), "en");
  assert.equal(resolveLocale(["tr", "en"]), "tr");
  assert.equal(resolveLocale([]), "tr");
  assert.equal(resolveLocale(["fr", "de"]), "tr");
});

test("parseAcceptLanguage q değerine göre sıralar", () => {
  assert.deepEqual(parseAcceptLanguage("en-US,en;q=0.9,tr;q=0.8"), ["en-US", "en", "tr"]);
  // Ağırlığı yüksek olan sonra yazılmış olsa da öne geçer.
  assert.deepEqual(parseAcceptLanguage("tr;q=0.5,en;q=0.9"), ["en", "tr"]);
  // q=0 "istemiyorum" demektir, listeye alınmaz.
  assert.deepEqual(parseAcceptLanguage("en;q=0,tr"), ["tr"]);
  assert.deepEqual(parseAcceptLanguage(null), []);
});

const dict: TranslationDict = {
  "Görev ekle": "Add task",
  "Kapat ##anahtar": "Off",
  Kapat: "Close",
  "Merhaba {ad}": "Hello {ad}",
  "{n} görev": { one: "{n} task", other: "{n} tasks" },
};

test("Türkçede sözlük hiç okunmaz, kaynak metin döner", () => {
  // Sözlükte "Görev ekle" -> "Add task" var ama Türkçe çevirmen ona bakmamalı.
  const t = createTranslator("tr", dict);
  assert.equal(t("Görev ekle"), "Görev ekle");
  assert.equal(t("Merhaba {ad}", { ad: "Can" }), "Merhaba Can");
});

test("İngilizcede karşılığı olmayan metin Türkçe görünür", () => {
  const t = createTranslator("en", dict);
  assert.equal(t("Henüz çevrilmemiş metin"), "Henüz çevrilmemiş metin");
});

test("bağlam eşsesli metinleri ayırır", () => {
  const t = createTranslator("en", dict);
  assert.equal(t("Kapat"), "Close");
  assert.equal(t("Kapat", { ctx: "anahtar" }), "Off");
  // Bağlamlı karşılık yoksa bağlamsız olana düşülür, Türkçeye değil.
  assert.equal(t("Görev ekle", { ctx: "buton" }), "Add task");
});

test("çoğul biçim n değerine göre seçilir", () => {
  const t = createTranslator("en", dict);
  assert.equal(t("{n} görev", { n: 1 }), "1 task");
  assert.equal(t("{n} görev", { n: 5 }), "5 tasks");
  assert.equal(t("{n} görev", { n: 0 }), "0 tasks");
});

test("tanımsız yer tutucu olduğu gibi kalır", () => {
  const t = createTranslator("en", dict);
  // Boş dizeye çevrilseydi "Hello " diye sessizce bozuk bir metin çıkardı;
  // yer tutucu ekranda görününce eksik parametre gözle yakalanır.
  assert.equal(t("Merhaba {ad}"), "Hello {ad}");
});

test("dictKey bağlamı metnin sonuna ekler", () => {
  assert.equal(dictKey("Kapat"), "Kapat");
  assert.equal(dictKey("Kapat", "anahtar"), "Kapat ##anahtar");
});

test("isLocale yalnızca desteklenen dilleri kabul eder", () => {
  assert.equal(isLocale("tr"), true);
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("de"), false);
  assert.equal(isLocale(null), false);
});
