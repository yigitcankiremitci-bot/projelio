import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  baglantiAlaniOkunur,
  baglantiAlaniYazilir,
  deftereEklemeHatasi,
  kartDuzenlemeKarari,
  kayitOkunur,
  kayitYazilir,
  kayitYonetilir,
} from "./baglanti-erisim";

// Bağlantılar'daki rakip kartı satış ekibine açılmamalı; müşteriye dönüşen
// kartın ilişki notu da. Buradaki bir gerileme yönetimin rakip notlarını
// satışçının ekranına taşır.

const yonetici = { canRead: true, canWrite: true, canManageTeam: true };
const uye = { canRead: true, canWrite: true, canManageTeam: false };
const saltOkur = { canRead: true, canWrite: false, canManageTeam: false };
const yok = { canRead: false, canWrite: false, canManageTeam: false };

const YALNIZ_BAGLANTI = ["baglantilar"];
const YALNIZ_MUSTERI = ["crm_musteri"];
const IKISI = ["crm_musteri", "baglantilar"];

describe("kayitOkunur", () => {
  test("yalnızca Bağlantılar'daki kart Müşteriler yetkisiyle okunamaz", () => {
    assert.equal(kayitOkunur(YALNIZ_BAGLANTI, { crm_musteri: yonetici, baglantilar: yok }), false);
    assert.equal(kayitOkunur(YALNIZ_BAGLANTI, { crm_musteri: yonetici }), false);
  });

  test("iki defterdeki kart ikisinden biriyle okunur", () => {
    assert.equal(kayitOkunur(IKISI, { crm_musteri: saltOkur, baglantilar: yok }), true);
    assert.equal(kayitOkunur(IKISI, { crm_musteri: yok, baglantilar: saltOkur }), true);
  });

  test("hiçbir defterde yetki yoksa okunmaz", () => {
    assert.equal(kayitOkunur(IKISI, { crm_musteri: yok, baglantilar: yok }), false);
    assert.equal(kayitOkunur(YALNIZ_MUSTERI, {}), false);
  });
});

describe("kayitYazilir / kayitYonetilir", () => {
  test("Bağlantılar'da salt okur, Müşteriler'de yazar: yalnızca Müşteriler'deki kart yazılır", () => {
    const e = { crm_musteri: uye, baglantilar: saltOkur };
    assert.equal(kayitYazilir(YALNIZ_MUSTERI, e), true);
    assert.equal(kayitYazilir(YALNIZ_BAGLANTI, e), false);
  });

  test("birleştirme yönetici ister", () => {
    assert.equal(kayitYonetilir(YALNIZ_BAGLANTI, { baglantilar: uye }), false);
    assert.equal(kayitYonetilir(YALNIZ_BAGLANTI, { baglantilar: yonetici }), true);
    assert.equal(kayitYonetilir(YALNIZ_BAGLANTI, { crm_musteri: yonetici }), false);
  });
});

describe("bağlantı alanları", () => {
  test("müşteriye dönüşen kartın ilişki notu Müşteriler yetkisiyle görülmez", () => {
    assert.equal(baglantiAlaniOkunur(IKISI, { crm_musteri: yonetici, baglantilar: yok }), false);
    assert.equal(baglantiAlaniOkunur(IKISI, { crm_musteri: yonetici }), false);
  });

  test("Bağlantılar'da okuyan görür, yazan yazar", () => {
    assert.equal(baglantiAlaniOkunur(IKISI, { baglantilar: saltOkur }), true);
    assert.equal(baglantiAlaniYazilir(IKISI, { baglantilar: saltOkur }), false);
    assert.equal(baglantiAlaniYazilir(IKISI, { baglantilar: uye }), true);
  });

  test("Bağlantılar'da durmayan kartın bağlantı alanı yok — yetki olsa bile", () => {
    assert.equal(baglantiAlaniOkunur(YALNIZ_MUSTERI, { baglantilar: yonetici }), false);
    assert.equal(baglantiAlaniYazilir(YALNIZ_MUSTERI, { baglantilar: yonetici }), false);
  });
});

describe("kartDuzenlemeKarari", () => {
  test("Bağlantılar'da yazar olan, sorumlusu başkası olan kartı da düzenler", () => {
    assert.equal(kartDuzenlemeKarari(YALNIZ_BAGLANTI, { baglantilar: uye }, "baskasi", undefined, "ben"), null);
  });

  test("Bağlantılar'da sorumluyu başkasına yalnızca yönetici verir", () => {
    assert.ok(kartDuzenlemeKarari(YALNIZ_BAGLANTI, { baglantilar: uye }, "ben", "baskasi", "ben"));
    assert.equal(kartDuzenlemeKarari(YALNIZ_BAGLANTI, { baglantilar: yonetici }, "ben", "baskasi", "ben"), null);
    // Kendini sorumlu yapmak ya da sorumluya dokunmamak devir değil.
    assert.equal(kartDuzenlemeKarari(YALNIZ_BAGLANTI, { baglantilar: uye }, "baskasi", "ben", "ben"), null);
    assert.equal(kartDuzenlemeKarari(YALNIZ_BAGLANTI, { baglantilar: uye }, "baskasi", "baskasi", "ben"), null);
  });

  test("Bağlantılar'da yazar değilse Müşteriler kuralı geçerli", () => {
    const e = { crm_musteri: uye, baglantilar: saltOkur };
    assert.ok(kartDuzenlemeKarari(IKISI, e, "baskasi", undefined, "ben"));
    assert.equal(kartDuzenlemeKarari(IKISI, e, "ben", undefined, "ben"), null);
  });

  test("Müşteriler yetkisi yalnızca Bağlantılar'daki kartı düzenletmez", () => {
    assert.ok(kartDuzenlemeKarari(YALNIZ_BAGLANTI, { crm_musteri: yonetici }, "ben", undefined, "ben"));
  });
});

describe("deftereEklemeHatasi", () => {
  test("iki modülde yazar olan bağlantıyı müşteri yapar", () => {
    assert.equal(deftereEklemeHatasi(YALNIZ_BAGLANTI, { baglantilar: uye }, "crm_musteri", uye, true), null);
  });

  test("Müşteriler'de yazma yetkisi yoksa bağlantı satış defterine itilemez", () => {
    assert.ok(deftereEklemeHatasi(YALNIZ_BAGLANTI, { baglantilar: yonetici }, "crm_musteri", saltOkur, true));
    assert.ok(deftereEklemeHatasi(YALNIZ_BAGLANTI, { baglantilar: yonetici }, "crm_musteri", undefined, true));
  });

  test("kartı bugünkü defterinde değiştiremeyen başka deftere alamaz", () => {
    assert.ok(deftereEklemeHatasi(YALNIZ_MUSTERI, { crm_musteri: saltOkur }, "baglantilar", yonetici, true));
  });

  test("hedef modül açık değilse — sahip bile olsa — eklenmez", () => {
    assert.ok(deftereEklemeHatasi(YALNIZ_MUSTERI, { crm_musteri: yonetici }, "baglantilar", yonetici, false));
  });

  test("zaten o defterdeyse yapılacak bir şey yok", () => {
    assert.equal(deftereEklemeHatasi(IKISI, {}, "crm_musteri", undefined, false), null);
  });
});
