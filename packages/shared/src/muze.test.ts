import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { katkilariDiz, muzeOzeti, muzeProjeDurumu, plaketYili, plaketiGorebilir, teslimSonucu } from "./muze";

describe("plaketiGorebilir", () => {
  test("katılımcı ya da işi yöneten görür, ikisi de değilse görmez", () => {
    assert.equal(plaketiGorebilir({ katilimciMi: true, isiYonetiyor: false }), true);
    assert.equal(plaketiGorebilir({ katilimciMi: false, isiYonetiyor: true }), true);
    assert.equal(plaketiGorebilir({ katilimciMi: false, isiYonetiyor: false }), false);
  });
});

describe("muzeProjeDurumu — plaket değil, Arşivde aç bağlantısı", () => {
  test("silinmiş ya da görülemeyen proje kapalı", () => {
    assert.equal(muzeProjeDurumu(null, true), "kapali");
    assert.equal(muzeProjeDurumu({ status: "completed" }, false), "kapali");
  });
  test("arşiv, hâlâ bitmiş, yeniden açılmış", () => {
    assert.equal(muzeProjeDurumu({ status: "completed", archivedAt: "2026-11-01" }, true), "arsivde");
    assert.equal(muzeProjeDurumu({ status: "completed", archivedAt: null }, true), "tamamlandi");
    assert.equal(muzeProjeDurumu({ status: "active" }, true), "yeniden_acildi");
  });
});

describe("katkilariDiz — sıralama yok, ada göre", () => {
  test("görev sayısına bakmaz, Türkçe alfabeyle dizer, eski üyeler sonda", () => {
    const sonuc = katkilariDiz([
      { userId: null, ad: "Eski ekip üyesi", gorev: 9 },
      { userId: "b", ad: "Zeynep", gorev: 1 },
      { userId: "c", ad: "Çağla", gorev: 40 },
      { userId: "a", ad: "Can", gorev: 3 },
    ]);
    assert.deepEqual(
      sonuc.map((k) => k.ad),
      ["Can", "Çağla", "Zeynep", "Eski ekip üyesi"]
    );
  });
  test("girdiyi değiştirmez", () => {
    const girdi = [
      { userId: "b", ad: "B", gorev: 0 },
      { userId: "a", ad: "A", gorev: 0 },
    ];
    katkilariDiz(girdi);
    assert.equal(girdi[0].ad, "B");
  });
});

describe("teslimSonucu", () => {
  test("erken, tam, geç, teslimsiz", () => {
    assert.deepEqual(teslimSonucu(3), { tur: "erken", gun: 3 });
    assert.deepEqual(teslimSonucu(0), { tur: "tam" });
    assert.deepEqual(teslimSonucu(-5), { tur: "gec", gun: 5 });
    assert.equal(teslimSonucu(undefined), null);
    assert.equal(teslimSonucu(null), null);
  });
});

describe("muzeOzeti", () => {
  test("aynı kişi bir kez, eski üyeler ayrı ayrı sayılır", () => {
    const o = muzeOzeti([
      { sureGun: 10, gorevSayisi: 4, katkilar: [{ userId: "a", ad: "A", gorev: 2 }, { userId: null, ad: "Eski", gorev: 1 }] },
      { sureGun: 5, gorevSayisi: 2, katkilar: [{ userId: "a", ad: "A", gorev: 1 }, { userId: "b", ad: "B", gorev: 1 }] },
    ]);
    assert.deepEqual(o, { proje: 2, kisi: 3, gun: 15, gorev: 6 });
  });
  test("boş müze", () => {
    assert.deepEqual(muzeOzeti([]), { proje: 0, kisi: 0, gun: 0, gorev: 0 });
  });
});

describe("plaketYili — Türkiye saati", () => {
  test("31 Aralık 22:00 UTC Türkiye'de yeni yıldır", () => {
    assert.equal(plaketYili("2025-12-31T22:00:00.000Z"), 2026);
    assert.equal(plaketYili("2025-12-31T20:00:00.000Z"), 2025);
  });
});
