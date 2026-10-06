import * as assert from "node:assert/strict";
import { test } from "node:test";
import { bultenGirdisiniCoz } from "./bulten";

test("geçerli adres küçük harfe çevrilip kaydedilir", () => {
  const k = bultenGirdisiniCoz({ eposta: "  Ali@Ornek.COM ", izin: true, dil: "en", kaynak: "/en" });
  assert.deepEqual(k, { tur: "kaydet", eposta: "ali@ornek.com", dil: "en", kaynak: "/en" });
});

test("izin kutusu işaretlenmeden kayıt açılmaz", () => {
  assert.equal(bultenGirdisiniCoz({ eposta: "a@b.co" }).tur, "hata");
  assert.equal(bultenGirdisiniCoz({ eposta: "a@b.co", izin: "true" }).tur, "hata");
});

test("bozuk adres reddedilir", () => {
  assert.equal(bultenGirdisiniCoz({ eposta: "ali@ornek", izin: true }).tur, "hata");
  assert.equal(bultenGirdisiniCoz({ eposta: 42, izin: true }).tur, "hata");
});

test("bal küpü doluysa bot sayılır", () => {
  assert.equal(bultenGirdisiniCoz({ eposta: "a@b.co", izin: true, website: "x" }).tur, "bot");
});

test("bilinmeyen dil Türkçeye düşer", () => {
  const k = bultenGirdisiniCoz({ eposta: "a@b.co", izin: true, dil: "de" });
  assert.equal(k.tur === "kaydet" && k.dil, "tr");
});
