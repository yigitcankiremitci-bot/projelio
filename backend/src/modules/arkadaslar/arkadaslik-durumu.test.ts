import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  aramaSirasi,
  aramaSorgusuCoz,
  duvarErisimi,
  duvarPaylasiminiSilebilir,
  durumHesapla,
  istekKarari,
  likeKacir,
  oneriSirala,
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

  test("kullanıcı adı @ ile ya da @ olmadan aranır", () => {
    assert.deepEqual(aramaSorgusuCoz("@Ali_can"), { tur: "metin", deger: "Ali_can" });
    assert.deepEqual(aramaSorgusuCoz("ali_can"), { tur: "metin", deger: "ali_can" });
  });

  test("ad-soyad aranır, harfler küçültülmeden gider", () => {
    // Küçültmeyi ilike yapar; "Işık"ı Türkçe küçültmek Postgres'te eşleşmezdi.
    assert.deepEqual(aramaSorgusuCoz("Şükrü  Işık"), { tur: "metin", deger: "Şükrü Işık" });
  });

  test("iki karakter yeter, tek karakter aranmaz", () => {
    assert.deepEqual(aramaSorgusuCoz("ay"), { tur: "metin", deger: "ay" });
    assert.equal(aramaSorgusuCoz("a"), null);
    assert.equal(aramaSorgusuCoz("@a"), null);
    assert.equal(aramaSorgusuCoz(undefined), null);
  });

  test("PostgREST filtre sözdizimi metinden atılır", () => {
    // Virgül ve parantez or=(...) filtresini bozup başka koşul eklettirebilirdi.
    assert.deepEqual(aramaSorgusuCoz("ali),id.eq.(x*"), { tur: "metin", deger: "aliid.eq.x" });
  });

  test("LIKE joker karakterleri kaçırılır", () => {
    // "_" kullanıcı adında geçerli ama LIKE'ta "herhangi bir karakter" demek.
    assert.equal(likeKacir("ali_c%"), "ali\\_c\\%");
  });
});

describe("aramaSirasi", () => {
  test("kullanıcı adı birebir, sonra önek, sonra ad", () => {
    const sira = (u: string, ad: string) => aramaSirasi("can", { username: u, fullName: ad });
    assert.equal(sira("can", "Zeynep"), 0);
    assert.equal(sira("cansu", "Cansu Ak"), 1);
    assert.equal(sira("ck", "Can Kaya"), 2);
    assert.equal(sira("ak", "Ali Can"), 3);
    assert.equal(aramaSirasi("CAN", { username: "can", fullName: "X" }), 0);
  });
});

describe("oneriSirala", () => {
  test("arkadaşlık satırı olan herkes ve kendim elenir", () => {
    const sonuc = oneriSirala(new Map([["b", 1], ["c", 2]]), new Map([["ben", 3], ["d", 1]]), new Set(["ben", "c"]));
    assert.deepEqual(sonuc.map((o) => o.userId).sort(), ["b", "d"]);
  });

  test("ortak arkadaş birlikte çalışmaktan ağır basar", () => {
    const sonuc = oneriSirala(new Map([["b", 2]]), new Map([["c", 2]]), new Set());
    assert.deepEqual(sonuc.map((o) => o.userId), ["b", "c"]);
  });

  test("iki kaynaktan gelen sayılar aynı kişide birleşir", () => {
    const [o] = oneriSirala(new Map([["b", 1]]), new Map([["b", 3]]), new Set());
    assert.deepEqual(o, { userId: "b", ortakArkadasSayisi: 1, ortakAlanSayisi: 3 });
  });

  test("tavan uygulanır", () => {
    const cok = new Map(Array.from({ length: 30 }, (_, i) => [`u${i}`, 1] as [string, number]));
    assert.equal(oneriSirala(cok, new Map(), new Set(), 20).length, 20);
  });
});
