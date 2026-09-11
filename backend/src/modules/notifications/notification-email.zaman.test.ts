import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { gunlukOzetSirasiGeldiMi, yerelAn, zamanDilimiGecerliMi } from "./notification-email.zaman";

describe("yerelAn", () => {
  it("aynı anı farklı saat dilimlerinde farklı saatlerde gösterir", () => {
    // 2026-09-11T06:30:00Z → İstanbul (UTC+3) 09:30, Los Angeles (UTC-7) önceki gün 23:30
    const an = new Date("2026-09-11T06:30:00Z");
    assert.deepEqual(yerelAn(an, "Europe/Istanbul"), { gun: "2026-09-11", saat: 9 });
    assert.deepEqual(yerelAn(an, "America/Los_Angeles"), { gun: "2026-09-10", saat: 23 });
  });

  it("yarım saatlik ofsetleri doğru çözer", () => {
    // Hindistan UTC+5:30 — tam saat varsayan bir hesap burada kayardı.
    assert.deepEqual(yerelAn(new Date("2026-09-11T04:00:00Z"), "Asia/Kolkata"), {
      gun: "2026-09-11",
      saat: 9,
    });
  });

  it("gece yarısını 24 değil 0 olarak verir", () => {
    assert.equal(yerelAn(new Date("2026-09-10T21:10:00Z"), "Europe/Istanbul").saat, 0);
  });

  it("geçersiz saat diliminde patlamaz, varsayılana düşer", () => {
    const an = new Date("2026-09-11T06:30:00Z");
    assert.deepEqual(yerelAn(an, "Mars/Olympus"), yerelAn(an, "Europe/Istanbul"));
  });
});

describe("zamanDilimiGecerliMi", () => {
  it("IANA adlarını kabul, uydurmaları reddeder", () => {
    assert.equal(zamanDilimiGecerliMi("Europe/Istanbul"), true);
    assert.equal(zamanDilimiGecerliMi("UTC"), true);
    assert.equal(zamanDilimiGecerliMi("Mars/Olympus"), false);
    assert.equal(zamanDilimiGecerliMi(""), false);
  });
});

describe("gunlukOzetSirasiGeldiMi", () => {
  const istanbul09 = { timezone: "Europe/Istanbul", dailyHour: 9 };

  it("saat gelmeden göndermez", () => {
    const sonuc = gunlukOzetSirasiGeldiMi({
      simdi: new Date("2026-09-11T05:00:00Z"), // İstanbul 08:00
      sonOzetGunu: null,
      ...istanbul09,
    });
    assert.deepEqual(sonuc, { gonder: false, gun: "2026-09-11" });
  });

  it("saat geldiğinde gönderir", () => {
    const sonuc = gunlukOzetSirasiGeldiMi({
      simdi: new Date("2026-09-11T06:05:00Z"), // İstanbul 09:05
      sonOzetGunu: null,
      ...istanbul09,
    });
    assert.deepEqual(sonuc, { gonder: true, gun: "2026-09-11" });
  });

  it("aynı gün ikinci kez göndermez", () => {
    const sonuc = gunlukOzetSirasiGeldiMi({
      simdi: new Date("2026-09-11T12:00:00Z"),
      sonOzetGunu: "2026-09-11",
      ...istanbul09,
    });
    assert.equal(sonuc.gonder, false);
  });

  it("tur kaçmışsa geç de olsa gönderir — atlamaz", () => {
    const sonuc = gunlukOzetSirasiGeldiMi({
      simdi: new Date("2026-09-11T19:00:00Z"), // İstanbul 22:00
      sonOzetGunu: "2026-09-10",
      ...istanbul09,
    });
    assert.equal(sonuc.gonder, true);
  });

  it("kullanıcının yerel günü sunucununkinden farklıysa onun gününü kullanır", () => {
    // Sunucu (UTC) için 11 Eylül; Los Angeles'ta hâlâ 10 Eylül ve saat 23.
    const sonuc = gunlukOzetSirasiGeldiMi({
      simdi: new Date("2026-09-11T06:30:00Z"),
      timezone: "America/Los_Angeles",
      dailyHour: 9,
      sonOzetGunu: "2026-09-10",
    });
    assert.deepEqual(sonuc, { gonder: false, gun: "2026-09-10" });
  });
});
