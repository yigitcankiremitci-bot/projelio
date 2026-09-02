// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { e164ToJid, isGroupJid, isLidJid, jidToE164, maskPhone, normalizePhoneE164 } from "./whatsapp-phone";

describe("telefon normalizasyonu", () => {
  const cases: [string, string | null][] = [
    ["+90 532 123 45 67", "+905321234567"],
    ["0532 123 45 67", "+905321234567"],
    ["05321234567", "+905321234567"],
    ["5321234567", "+905321234567"],
    ["905321234567", "+905321234567"],
    ["00905321234567", "+905321234567"],
    ["(0532) 123-45-67", "+905321234567"],
    ["+49 151 23456789", "+4915123456789"],
    ["", null],
    ["abc", null],
    ["123", null],
    ["12345678901234567", null],
  ];

  for (const [input, expected] of cases) {
    test(`"${input}" → ${expected}`, () => {
      assert.equal(normalizePhoneE164(input), expected);
    });
  }
});

describe("JID dönüşümü", () => {
  test("E.164 → JID", () => {
    assert.equal(e164ToJid("+905321234567"), "905321234567@c.us");
  });

  test("JID → E.164 yalnızca kişi adresleri", () => {
    assert.equal(jidToE164("905321234567@c.us"), "+905321234567");
    assert.equal(jidToE164("905321234567@s.whatsapp.net"), "+905321234567");
    assert.equal(jidToE164("120363012345678901@g.us"), null);
    assert.equal(jidToE164("123456789012345@lid"), null);
    assert.equal(jidToE164(undefined), null);
  });

  test("LID ve grup ayrımı", () => {
    assert.equal(isLidJid("1234@lid"), true);
    assert.equal(isLidJid("1234@c.us"), false);
    assert.equal(isGroupJid("1234@g.us"), true);
  });
});

describe("maskeleme", () => {
  test("Türkiye numarası", () => {
    assert.equal(maskPhone("+905321234567"), "+90 532 ••• 67");
  });

  test("boş", () => {
    assert.equal(maskPhone(null), "");
  });
});
