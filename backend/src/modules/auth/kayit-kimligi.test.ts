import { test } from "node:test";
import * as assert from "node:assert/strict";
import { epostadanAd, rastgeleKullaniciAdi } from "./kayit-kimligi";

test("e-postadan okunur ad türetilir", () => {
  assert.equal(epostadanAd("ayse.demir+is@x.com"), "Ayse Demir");
  assert.equal(epostadanAd("mehmet_kaya@x.com"), "Mehmet Kaya");
});

test("harf yoksa boş ad üretilmez", () => {
  assert.equal(epostadanAd("12345@x.com"), "12345");
});

test("üretilen kullanıcı adı kayıt kuralına uyar ve e-postayı içermez", () => {
  const ad = rastgeleKullaniciAdi();
  assert.match(ad, /^[a-zA-Z0-9_.]{3,30}$/);
  assert.notEqual(ad, rastgeleKullaniciAdi());
});
