import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  aramaSorgusuCoz,
  duvarErisimi,
  duvarPaylasiminiSilebilir,
  durumHesapla,
  istekKarari,
  likeKacir,
  type ArkadaslikSatiri,
} from "./arkadaslik-durumu";

// Bu kararlar kimin kimin duvarını göreceğini belirliyor. Buradaki bir
// gerileme ya özel paylaşımları yabancıya açar ya da reddedilen kişiye
// reddedildiğini sızdırır.

const satir = (durum: ArkadaslikSatiri["durum"], isteyen = "a", alan = "b"): ArkadaslikSatiri => ({
  id: "s1",
  isteyen_id: isteyen,
  alan_id: alan,
  durum,
});

describe("durumHesapla", () => {
  test("kendine bakan kendisi", () => {
    assert.equal(durumHesapla(null, "a", "a"), "kendisi");
  });

  test("satır yoksa ilişki yok", () => {
    assert.equal(durumHesapla(null, "a", "b"), "yok");
  });

  test("bekleyen istek yöne göre gelen/giden", () => {
    assert.equal(durumHesapla(satir("bekliyor"), "a", "b"), "giden_istek");
    assert.equal(durumHesapla(satir("bekliyor"), "b", "a"), "gelen_istek");
  });

  test("kabul edilmişse iki taraf için de arkadaş", () => {
    assert.equal(durumHesapla(satir("kabul"), "a", "b"), "arkadas");
    assert.equal(durumHesapla(satir("kabul"), "b", "a"), "arkadas");
  });

  test("reddedilen istek isteyene hâlâ gönderilmiş görünür, reddedene yok", () => {
    assert.equal(durumHesapla(satir("reddedildi"), "a", "b"), "giden_istek");
    assert.equal(durumHesapla(satir("reddedildi"), "b", "a"), "yok");
  });
});

describe("istekKarari", () => {
  test("ilk istek yeni satır açar", () => {
    assert.deepEqual(istekKarari(null, "a", "b"), { islem: "ekle" });
  });

  test("karşı taraf zaten istemişse göndermek kabul etmektir", () => {
    assert.deepEqual(istekKarari(satir("bekliyor", "b", "a"), "a", "b"), { islem: "kabul_et" });
  });

  test("aynı isteği ikinci kez göndermek bir şey yapmaz", () => {
    assert.deepEqual(istekKarari(satir("bekliyor"), "a", "b"), { islem: "yok", durum: "giden_istek" });
  });

  test("reddedilen kişi yeniden gönderemez, bildirim de gitmez", () => {
    assert.deepEqual(istekKarari(satir("reddedildi"), "a", "b"), { islem: "yok", durum: "giden_istek" });
  });

  test("reddeden taraf fikir değiştirirse satır yön değiştirir", () => {
    assert.deepEqual(istekKarari(satir("reddedildi"), "b", "a"), { islem: "yeniden_ac" });
  });

  test("zaten arkadaşsa bir şey yapılmaz", () => {
    assert.deepEqual(istekKarari(satir("kabul"), "b", "a"), { islem: "yok", durum: "arkadas" });
  });
});

describe("duvar yetkisi", () => {
  test("duvarı sahibi ve arkadaşları görür, yabancı göremez", () => {
    assert.equal(duvarErisimi("a", "a", false), true);
    assert.equal(duvarErisimi("b", "a", true), true);
    assert.equal(duvarErisimi("c", "a", false), false);
  });

  test("paylaşımı yazan ya da duvar sahibi siler, üçüncü kişi silemez", () => {
    assert.equal(duvarPaylasiminiSilebilir("b", "b", "a"), true);
    assert.equal(duvarPaylasiminiSilebilir("a", "b", "a"), true);
    assert.equal(duvarPaylasiminiSilebilir("c", "b", "a"), false);
  });
});

describe("aramaSorgusuCoz", () => {
  test("e-posta tam eşleşme olarak aranır", () => {
    assert.deepEqual(aramaSorgusuCoz("  Ali@Ornek.com "), { tur: "eposta", deger: "ali@ornek.com" });
  });

  test("kullanıcı adı başındaki @ atılarak aranır", () => {
    assert.deepEqual(aramaSorgusuCoz("@ali_can"), { tur: "kullanici_adi", deger: "ali_can" });
  });

  test("ad-soyad ya da kısa sorgu aranmaz", () => {
    // Boşluklu metin kullanıcı adı olamaz: adla arama bilerek kapalı.
    assert.equal(aramaSorgusuCoz("Ali Can"), null);
    assert.equal(aramaSorgusuCoz("al"), null);
    assert.equal(aramaSorgusuCoz(undefined), null);
  });

  test("LIKE joker karakterleri kaçırılır", () => {
    // "_" kullanıcı adında geçerli ama LIKE'ta "herhangi bir karakter" demek.
    assert.equal(likeKacir("ali_c%"), "ali\\_c\\%");
  });
});
