import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { aramaDurumu, gunEkle, temasOzeti, tekrarAramaOnerileri } from "./gorusmeNotlari";

// Potansiyel müşteri listesi "kimi aramalıyım" sorusunu bu özetten cevaplıyor.
// Buradaki bir gerileme ya başarılı aramadan sonra "3 kez ulaşılamadı" yazar ya
// da sistem kaydını (rol eklendi) son temas sanar.

describe("temasOzeti", () => {
  test("ulaşılamadı serisi ilk başarılı temasta kesilir; sistem kaydı sayılmaz", () => {
    const o = temasOzeti([
      { type: "ulasilamadi", occurredAt: "2026-10-12T09:00:00Z" },
      { type: "sistem", occurredAt: "2026-10-12T10:00:00Z" },
      { type: "ulasilamadi", occurredAt: "2026-10-11T09:00:00Z" },
      { type: "arama", occurredAt: "2026-10-10T09:00:00Z" },
      { type: "ulasilamadi", occurredAt: "2026-10-09T09:00:00Z" },
    ]);
    assert.equal(o.ulasilamadiSerisi, 2);
    assert.equal(o.notSayisi, 4);
    assert.equal(o.sonTemas?.type, "ulasilamadi");
    assert.equal(o.sonTemas?.occurredAt, "2026-10-12T09:00:00Z");
  });

  test("son temas başarılıysa seri 0; hiç not yoksa son temas yok", () => {
    assert.equal(
      temasOzeti([
        { type: "ulasilamadi", occurredAt: "2026-10-11T09:00:00Z" },
        { type: "arama", occurredAt: "2026-10-12T09:00:00Z" },
      ]).ulasilamadiSerisi,
      0
    );
    const bos = temasOzeti([{ type: "sistem", occurredAt: "2026-10-12T09:00:00Z" }]);
    assert.equal(bos.sonTemas, undefined);
    assert.equal(bos.notSayisi, 0);
  });
});

describe("aramaDurumu", () => {
  test("geçmiş gün gecikti, bugün bugün, ileri tarih yakında, boş planlı değil", () => {
    assert.equal(aramaDurumu("2026-10-11", "2026-10-12"), "gecikti");
    assert.equal(aramaDurumu("2026-10-12", "2026-10-12"), "bugun");
    assert.equal(aramaDurumu("2026-10-20", "2026-10-12"), "yakinda");
    assert.equal(aramaDurumu(undefined, "2026-10-12"), undefined);
  });
});

describe("gunEkle / tekrarAramaOnerileri", () => {
  test("ay ve yıl sınırını geçer", () => {
    assert.equal(gunEkle("2026-10-31", 1), "2026-11-01");
    assert.equal(gunEkle("2026-12-29", 7), "2027-01-05");
  });

  test("kısayollar yarından başlar", () => {
    assert.deepEqual(
      tekrarAramaOnerileri("2026-10-12").map((o) => o.gun),
      ["2026-10-13", "2026-10-15", "2026-10-19", "2026-10-26"]
    );
  });
});
