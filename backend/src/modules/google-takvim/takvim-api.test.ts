import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { etkinlikGovdesi, etkinligiSatiraCevir, girdiHatasi, takvimListesiniCevir } from "./takvim-api";

describe("etkinligiSatiraCevir", () => {
  test("saatli etkinlik UTC ISO'ya çevrilir", () => {
    const s = etkinligiSatiraCevir({
      id: "a1",
      summary: " Müşteri görüşmesi ",
      start: { dateTime: "2026-09-24T10:00:00+03:00" },
      end: { dateTime: "2026-09-24T11:30:00+03:00" },
      hangoutLink: "https://meet.google.com/abc",
      attendees: [{ email: "x@y.com" }, { email: "ben@y.com", self: true }, { email: "oda@y.com", resource: true }],
      organizer: { email: "x@y.com", displayName: "Ayşe" },
    });
    assert.ok(s);
    assert.equal(s.baslik, "Müşteri görüşmesi");
    assert.equal(s.baslangic, "2026-09-24T07:00:00.000Z");
    assert.equal(s.bitis, "2026-09-24T08:30:00.000Z");
    assert.equal(s.tum_gun, false);
    assert.equal(s.meet_link, "https://meet.google.com/abc");
    // Toplantı odası (resource) katılımcı sayılmaz.
    assert.equal(s.katilimci_sayisi, 2);
    assert.equal(s.duzenleyen, "Ayşe");
  });

  test("tüm gün etkinlik tarih olarak kalır, bitiş HARİÇ korunur", () => {
    const s = etkinligiSatiraCevir({ id: "b", start: { date: "2026-09-24" }, end: { date: "2026-09-25" } });
    assert.ok(s);
    assert.equal(s.tum_gun, true);
    assert.equal(s.baslangic, "2026-09-24T00:00:00.000Z");
    assert.equal(s.bitis, "2026-09-25T00:00:00.000Z");
  });

  test("iptal, reddedilen ve çalışma yeri etkinlikleri alınmaz", () => {
    const zaman = { start: { dateTime: "2026-09-24T10:00:00Z" }, end: { dateTime: "2026-09-24T11:00:00Z" } };
    assert.equal(etkinligiSatiraCevir({ id: "c", status: "cancelled", ...zaman }), null);
    assert.equal(etkinligiSatiraCevir({ id: "d", eventType: "workingLocation", ...zaman }), null);
    assert.equal(
      etkinligiSatiraCevir({ id: "e", attendees: [{ self: true, responseStatus: "declined" }], ...zaman }),
      null
    );
  });

  test("kendi düzenlediği etkinlikte düzenleyen boş kalır", () => {
    const s = etkinligiSatiraCevir({
      id: "f",
      start: { dateTime: "2026-09-24T10:00:00Z" },
      end: { dateTime: "2026-09-24T11:00:00Z" },
      organizer: { email: "ben@y.com", self: true },
    });
    assert.equal(s?.duzenleyen, null);
  });
});

describe("etkinlikGovdesi", () => {
  test("saatli: ofsetsiz saat + saat dilimi (yaz saatini Google çözer)", () => {
    const g = etkinlikGovdesi(
      { baslik: "Rapor", tarih: "2026-10-25", baslangicSaati: "09:00", bitisSaati: "10:30" },
      "Europe/Istanbul",
      { projelioBlok: "blok-1" }
    );
    assert.deepEqual(g.start, { dateTime: "2026-10-25T09:00:00", timeZone: "Europe/Istanbul" });
    assert.deepEqual(g.end, { dateTime: "2026-10-25T10:30:00", timeZone: "Europe/Istanbul" });
    assert.deepEqual(g.extendedProperties, { private: { projelio: "1", projelioBlok: "blok-1" } });
  });

  test("tüm gün: bitiş Google için bir gün ileri alınır", () => {
    const g = etkinlikGovdesi({ baslik: "Fuar", tarih: "2026-09-24", tumGun: true, bitisTarihi: "2026-09-26" }, "UTC");
    assert.deepEqual(g.start, { date: "2026-09-24" });
    assert.deepEqual(g.end, { date: "2026-09-27" });
  });

  test("tüm gün: bitiş tarihi yoksa tek gün", () => {
    const g = etkinlikGovdesi({ baslik: "İzin", tarih: "2026-12-31", tumGun: true }, "UTC");
    assert.deepEqual(g.end, { date: "2027-01-01" });
  });
});

describe("girdiHatasi", () => {
  test("geçerli girdiler", () => {
    assert.equal(girdiHatasi({ baslik: "x", tarih: "2026-09-24", baslangicSaati: "09:00", bitisSaati: "10:00" }), null);
    assert.equal(girdiHatasi({ baslik: "x", tarih: "2026-09-24", tumGun: true }), null);
  });

  test("hatalar", () => {
    assert.ok(girdiHatasi({ baslik: " ", tarih: "2026-09-24", tumGun: true }));
    assert.ok(girdiHatasi({ baslik: "x", tarih: "24.09.2026", tumGun: true }));
    assert.ok(girdiHatasi({ baslik: "x", tarih: "2026-09-24", baslangicSaati: "10:00", bitisSaati: "09:00" }));
    assert.ok(girdiHatasi({ baslik: "x", tarih: "2026-09-24", baslangicSaati: "25:00", bitisSaati: "26:00" }));
  });
});

describe("takvimListesiniCevir", () => {
  const ogeler = [
    { id: "tatil", summary: "Türkiye'deki Tatiller", accessRole: "reader" as const },
    { id: "ben@y.com", summary: "ben@y.com", primary: true, accessRole: "owner" as const, timeZone: "Europe/Istanbul" },
    { id: "aile", summary: "Aile", accessRole: "owner" as const },
    { id: "mesgul", summary: "Patron", accessRole: "freeBusyReader" as const },
  ];

  test("meşgul/boş takvimler dışarıda, birincil en üstte, abonelikler kapalı başlar", () => {
    const { takvimler, saatDilimi } = takvimListesiniCevir(ogeler);
    assert.equal(saatDilimi, "Europe/Istanbul");
    assert.deepEqual(
      takvimler.map((t) => [t.id, t.secili, t.yazilabilir]),
      [
        ["ben@y.com", true, true],
        ["aile", true, true],
        ["tatil", false, false],
      ]
    );
  });

  test("yeniden okumada kullanıcının seçimi korunur", () => {
    const { takvimler } = takvimListesiniCevir(ogeler, new Map([["aile", false], ["tatil", true]]));
    assert.deepEqual(
      takvimler.map((t) => [t.id, t.secili]),
      [
        ["ben@y.com", true],
        ["aile", false],
        ["tatil", true],
      ]
    );
  });
});
