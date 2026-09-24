import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { duvarSaatiAni, yerelBugun } from "./hatirlatma-ani";

describe("duvarSaatiAni", () => {
  it("İstanbul duvar saatini UTC'ye çevirir (sunucu UTC'de olsa da 3 saat kaymaz)", () => {
    const an = duvarSaatiAni("2026-09-24", "16:35", "Europe/Istanbul");
    assert.equal(an?.toISOString(), "2026-09-24T13:35:00.000Z");
  });

  it("gün timestamp olarak gelirse (gece yarısı ya da 23:59:59) yalnızca takvim günü okunur", () => {
    assert.equal(duvarSaatiAni("2026-09-21T00:00:00", "13:00:00", "Europe/Istanbul")?.toISOString(), "2026-09-21T10:00:00.000Z");
    assert.equal(duvarSaatiAni("2026-09-21T23:59:59", "13:00:00", "Europe/Istanbul")?.toISOString(), "2026-09-21T10:00:00.000Z");
  });

  it("gece yarısına yakın saat önceki UTC gününe düşer", () => {
    assert.equal(duvarSaatiAni("2026-09-24", "01:30", "Europe/Istanbul")?.toISOString(), "2026-09-23T22:30:00.000Z");
  });

  it("yaz saati olan dilimde iki mevsimi de doğru hesaplar", () => {
    assert.equal(duvarSaatiAni("2026-01-15", "09:00", "Europe/Berlin")?.toISOString(), "2026-01-15T08:00:00.000Z");
    assert.equal(duvarSaatiAni("2026-07-15", "09:00", "Europe/Berlin")?.toISOString(), "2026-07-15T07:00:00.000Z");
  });

  it("gün ya da saat eksikse null — tarihsiz hatırlatma hesaplanamaz", () => {
    assert.equal(duvarSaatiAni(null, "10:00"), null);
    assert.equal(duvarSaatiAni("2026-09-24", null), null);
    assert.equal(duvarSaatiAni("bozuk", "10:00"), null);
  });
});

describe("yerelBugun", () => {
  it("UTC'de hâlâ dün olan anı İstanbul'un bugününe çevirir", () => {
    assert.equal(yerelBugun(new Date("2026-09-23T22:30:00Z"), "Europe/Istanbul"), "2026-09-24");
  });
});
