import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { markdownBloklari, satirIci } from "./ajanMetin";

describe("satirIci", () => {
  test("kalın, bağlantı ve çıplak adres ayrılır", () => {
    assert.deepEqual(satirIci("**Not:** bkz. [kaynak](https://a.com) ve https://b.com"), [
      { tur: "kalin", metin: "Not:" },
      { tur: "metin", metin: " bkz. " },
      { tur: "baglanti", metin: "kaynak", adres: "https://a.com" },
      { tur: "metin", metin: " ve " },
      { tur: "baglanti", metin: "https://b.com", adres: "https://b.com" },
    ]);
  });

  test("http(s) olmayan bağlantı düz metne iner", () => {
    // Model bir sayfadan `javascript:` bağlantısı kopyalarsa tıklanabilir olmamalı.
    assert.deepEqual(satirIci("[tıkla](javascript:alert(1))"), [
      { tur: "metin", metin: "tıkla" },
      { tur: "metin", metin: ")" },
    ]);
  });
});

describe("markdownBloklari", () => {
  test("başlık, maddeler ve paragraf", () => {
    const b = markdownBloklari("# Rapor\n\nGiriş satırı\ndevamı\n\n- bir\n- iki\n1. ilk");
    assert.deepEqual(
      b.map((x) => x.tur),
      ["baslik", "paragraf", "liste", "liste"]
    );
    assert.deepEqual(b[1], { tur: "paragraf", parcalar: [{ tur: "metin", metin: "Giriş satırı devamı" }] });
    assert.equal(b[2].tur === "liste" && b[2].maddeler.length, 2);
  });

  test("HTML etiketi düz metin olarak kalır", () => {
    const b = markdownBloklari("<img src=x onerror=alert(1)>");
    assert.deepEqual(b, [{ tur: "paragraf", parcalar: [{ tur: "metin", metin: "<img src=x onerror=alert(1)>" }] }]);
  });
});
