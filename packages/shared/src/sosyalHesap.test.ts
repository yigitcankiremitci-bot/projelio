import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { instagramKaruselHatasi, normalizeSocialHandle } from "./sosyalHesap";

describe("sosyal kullanıcı adı", () => {
  test("@, profil adresi ve büyük harf aynı hesaba çözülür", () => {
    assert.equal(normalizeSocialHandle("@Pist.Istanbul"), "pist.istanbul");
    assert.equal(normalizeSocialHandle("https://www.instagram.com/pist.istanbul/"), "pist.istanbul");
    assert.equal(normalizeSocialHandle("https://x.com/projelio?s=20"), "projelio");
  });

  test("Türkçe yerel ayarında bile I küçük harfte i olur", () => {
    // tr-TR'de "I".toLowerCase() "ı" verir; kullanıcı adları ASCII.
    assert.equal(normalizeSocialHandle("YIGITCAN"), "yigitcan");
  });

  test("boş girdi boş döner", () => {
    assert.equal(normalizeSocialHandle("  @ "), "");
    assert.equal(normalizeSocialHandle(null), "");
  });
});

test("instagramKaruselHatasi: 10'a kadar sorun yok, 11'de uyarır", () => {
  assert.equal(instagramKaruselHatasi(10), null);
  assert.equal(instagramKaruselHatasi(0), null);
  assert.match(instagramKaruselHatasi(20) ?? "", /en fazla 10 medya.*20 medya var/);
});
