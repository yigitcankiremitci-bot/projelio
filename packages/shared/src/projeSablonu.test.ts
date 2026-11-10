import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  HAZIR_SABLONLAR,
  gunFarki,
  gunKaydir,
  icerigiDogrula,
  icerigiSuz,
  parcalariTemizle,
  sablonaCevir,
  yeniBitis,
  type ProjeIcerigi,
} from "./projeSablonu";

const ornek: ProjeIcerigi = {
  surum: 1,
  aciklama: "Açıklama",
  toplamButce: 1000,
  sureGun: 10,
  ciktilar: [{ ref: "c1", baslik: "Çıktı" }],
  gorevler: [
    { ref: "g1", baslik: "Ana", bitisGun: 5, ciktiRef: "c1", atananlar: ["u1"], butce: { tutar: 50, birim: "TRY" } },
    { ref: "g1.1", ustRef: "g1", baslik: "Alt", bitisGun: 5, atananlar: ["u2"] },
    { ref: "g2", baslik: "İkinci", bitisGun: 12 },
  ],
  bagimliliklar: [{ gorevRef: "g2", oncekiRef: "g1" }],
  etkinlikler: [{ baslik: "Toplantı", tur: "meeting", gun: 1, tumGun: true }],
  ekip: ["u1", "u2"],
};

describe("tarih", () => {
  test("gün farkı ve kaydırma ay/yıl sınırını aşar", () => {
    assert.equal(gunFarki("2026-12-30", "2027-01-02"), 3);
    assert.equal(gunKaydir("2026-02-27", 2), "2026-03-01");
    assert.equal(gunKaydir("2026-03-01", -1), "2026-02-28");
  });

  test("yeni bitiş en geç görevi kapsar", () => {
    assert.equal(yeniBitis("2026-01-01", ornek), "2026-01-13");
    assert.equal(yeniBitis("2026-01-01", { sureGun: 20, gorevler: [] }), "2026-01-21");
  });
});

describe("parçalar", () => {
  test("gereği seçilmeyen parça düşer; şablonda kişiler düşer", () => {
    assert.deepEqual([...parcalariTemizle(["altGorevler", "atamalar", "uydurma"])], []);
    assert.deepEqual([...parcalariTemizle(["gorevler", "atamalar", "ekip"], true)], ["gorevler"]);
  });

  test("çıktısız klonda görevin çıktı bağı kalkar, alt görevsizde alt görev yok", () => {
    const s = icerigiSuz(ornek, new Set(["gorevler"]));
    assert.deepEqual(s.gorevler.map((g) => g.ref), ["g1", "g2"]);
    assert.equal(s.gorevler[0].ciktiRef, undefined);
    assert.equal(s.gorevler[0].butce, null);
    assert.equal(s.gorevler[0].atananlar, undefined);
    assert.deepEqual(s.bagimliliklar, []);
    assert.equal(s.ekip, undefined);
  });

  test("hepsi seçilince her şey taşınır", () => {
    const s = icerigiSuz(ornek, parcalariTemizle(["aciklama", "butce", "ciktilar", "gorevler", "altGorevler", "bagimliliklar", "gorevButceleri", "etkinlikler", "atamalar", "ekip"]));
    assert.equal(s.gorevler.length, 3);
    assert.equal(s.gorevler[0].ciktiRef, "c1");
    assert.deepEqual(s.gorevler[1].atananlar, ["u2"]);
    assert.equal(s.bagimliliklar.length, 1);
    assert.deepEqual(s.ekip, ["u1", "u2"]);
    assert.equal(s.toplamButce, 1000);
  });

  test("şablona çevirince kişiler kalkar", () => {
    const s = sablonaCevir(ornek);
    assert.equal(s.ekip, undefined);
    assert.ok(s.gorevler.every((g) => g.atananlar === undefined));
  });
});

describe("doğrulama", () => {
  test("bozuk girdi boş ama geçerli içerik verir", () => {
    const d = icerigiDogrula("çöp");
    assert.deepEqual(d.gorevler, []);
    assert.equal(d.sureGun, 30);
  });

  test("yetim alt görev, kendine bağımlılık ve hatalı saatli etkinlik temizlenir", () => {
    const d = icerigiDogrula({
      sureGun: 5,
      gorevler: [
        { ref: "a", baslik: "A", bitisGun: 1 },
        { ref: "b", ustRef: "yok", baslik: "B", bitisGun: 1 },
        { ref: "c", ustRef: "a", baslik: "C", bitisGun: 1, ciktiRef: "yok" },
      ],
      bagimliliklar: [{ gorevRef: "a", oncekiRef: "a" }],
      etkinlikler: [{ baslik: "E", gun: 0, tumGun: false, baslangicSaati: "12:00", bitisSaati: "11:00" }],
    });
    assert.deepEqual(d.gorevler.map((g) => g.ref), ["a", "c"]);
    assert.equal(d.gorevler[1].ciktiRef, undefined);
    assert.deepEqual(d.bagimliliklar, []);
    assert.equal(d.etkinlikler[0].tumGun, true);
  });
});

describe("hazır şablonlar", () => {
  test("dördü de geçerli ve doluyor", () => {
    assert.equal(HAZIR_SABLONLAR.length, 4);
    for (const s of HAZIR_SABLONLAR) {
      assert.ok(s.id.startsWith("hazir:"), s.id);
      assert.ok(s.icerik.gorevler.length >= 5, s.ad);
      assert.ok(s.icerik.ciktilar.length >= 3, s.ad);
      assert.ok(s.icerik.bagimliliklar.length >= 3, s.ad);
      // Her bağımlılığın iki ucu da var, kimse kendini beklemiyor.
      const refler = new Set(s.icerik.gorevler.map((g) => g.ref));
      for (const b of s.icerik.bagimliliklar) {
        assert.ok(refler.has(b.gorevRef) && refler.has(b.oncekiRef) && b.gorevRef !== b.oncekiRef, s.ad);
      }
      // Doğrulamadan ikinci kez geçince değişmiyor (saklama + okuma kayıpsız).
      assert.deepEqual(icerigiDogrula(s.icerik), s.icerik);
    }
  });
});
