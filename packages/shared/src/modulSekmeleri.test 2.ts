import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MUSTERI_MODUL_KEY } from "./types";
import { acilisSekmesiCoz, modulSekmeleri } from "./modulSekmeleri";

describe("acilisSekmesiCoz", () => {
  test("müşteri modülünde varsayılan ve ilk sekme tahsilat", () => {
    assert.equal(modulSekmeleri(MUSTERI_MODUL_KEY)[0], "tahsilat");
    assert.equal(acilisSekmesiCoz(MUSTERI_MODUL_KEY, undefined), "tahsilat");
  });
  test("kayıtlı geçerli tercih kullanılır, kaldırılmış sekme ilk sekmeye düşer", () => {
    assert.equal(acilisSekmesiCoz(MUSTERI_MODUL_KEY, "potansiyel"), "potansiyel");
    assert.equal(acilisSekmesiCoz(MUSTERI_MODUL_KEY, "eski-sekme"), "tahsilat");
  });
  test("sekmesiz modül", () => {
    assert.equal(acilisSekmesiCoz("pd_rakip_sektor_analizi", "x"), undefined);
  });
});
