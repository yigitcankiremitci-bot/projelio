// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildLinkUrl, generateLinkCode, parseInboundCommand } from "./whatsapp-optin";

describe("gelen komut çözümleme", () => {
  test("eşleştirme kodu, küçük harf ve etrafında metinle bile", () => {
    assert.deepEqual(parseInboundCommand("projelio-k7x2"), { kind: "link", code: "PROJELIO-K7X2" });
    assert.deepEqual(parseInboundCommand("Merhaba PROJELIO-ABCD kodum"), { kind: "link", code: "PROJELIO-ABCD" });
  });

  test("kodda yasak karakter (0/O/1/I) varsa kod sayılmaz", () => {
    assert.deepEqual(parseInboundCommand("PROJELIO-AB0I"), { kind: "none" });
  });

  test("çıkış kelimeleri", () => {
    for (const w of ["DUR", "dur", "Durdur", "iptal", "STOP", "Çıkış", "dur."]) {
      assert.deepEqual(parseInboundCommand(w), { kind: "opt_out" }, w);
    }
  });

  test("başlatma kelimeleri", () => {
    for (const w of ["BAŞLAT", "baslat", "start", "Devam"]) {
      assert.deepEqual(parseInboundCommand(w), { kind: "opt_in" }, w);
    }
  });

  test("cümle içindeki komut kelimesi komut değildir", () => {
    assert.deepEqual(parseInboundCommand("dur bakalım şunu da ekle"), { kind: "none" });
  });

  test("boş", () => {
    assert.deepEqual(parseInboundCommand(""), { kind: "none" });
    assert.deepEqual(parseInboundCommand(undefined), { kind: "none" });
  });
});

describe("eşleştirme kodu üretimi", () => {
  test("biçim ve belirlenimcilik", () => {
    const code = generateLinkCode(() => 0);
    assert.equal(code, "PROJELIO-AAAA");
    assert.deepEqual(parseInboundCommand(code), { kind: "link", code });
  });

  test("wa.me bağlantısı", () => {
    assert.equal(buildLinkUrl("+905321234567", "PROJELIO-AB2C"), "https://wa.me/905321234567?text=PROJELIO-AB2C");
  });
});
