import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEMO_VARSAYILAN_AYARLAR,
  demoEpostaGecerli,
  demoIcsOlustur,
  demoSlotlariUret,
  demoTelefonGecerli,
  googleTakvimUrl,
  yereldenUtc,
  yerelTarih,
} from "./demoRandevu";

const ayar = {
  ...DEMO_VARSAYILAN_AYARLAR,
  minOncedenSaat: 0,
  maxGunIleri: 7,
  // Pazartesi 10:00-12:00 → 10:00 ve 10:50 (11:40 sığmaz: 12:20'de biterdi)
  calismaSaatleri: [{ gun: 1, baslangic: "10:00", bitis: "12:00" }],
};
// 2026-09-20 Pazar, İstanbul 09:00
const simdi = new Date("2026-09-20T06:00:00Z");

test("İstanbul saati UTC'ye çevrilir", () => {
  assert.equal(yereldenUtc("2026-09-21", "10:00", "Europe/Istanbul").toISOString(), "2026-09-21T07:00:00.000Z");
  assert.equal(yerelTarih(new Date("2026-09-20T22:30:00Z"), "Europe/Istanbul"), "2026-09-21");
});

test("çalışma aralığına sığan bloklar üretilir, tampon arada kalır", () => {
  const slotlar = demoSlotlariUret(ayar, simdi, []);
  assert.deepEqual(
    slotlar.map((s) => s.baslangic),
    ["2026-09-21T07:00:00.000Z", "2026-09-21T07:50:00.000Z"]
  );
  assert.equal(slotlar[0].bitis, "2026-09-21T07:40:00.000Z");
});

test("dolu blok ve tamponu düşer", () => {
  const slotlar = demoSlotlariUret(ayar, simdi, [
    { baslangic: "2026-09-21T07:00:00.000Z", bitis: "2026-09-21T07:40:00.000Z" },
  ]);
  assert.deepEqual(slotlar.map((s) => s.baslangic), ["2026-09-21T07:50:00.000Z"]);
  // Izgaraya oturmayan eski bir randevu (07:45) iki bloğu da kapatır.
  const ikisi = demoSlotlariUret(ayar, simdi, [
    { baslangic: "2026-09-21T07:35:00.000Z", bitis: "2026-09-21T08:15:00.000Z" },
  ]);
  assert.equal(ikisi.length, 0);
});

test("kapalı gün ve en erken süre uygulanır", () => {
  assert.equal(demoSlotlariUret({ ...ayar, kapaliGunler: [{ tarih: "2026-09-21", aciklama: null }] }, simdi, []).length, 0);
  // 25,5 saat önceden: Pazartesi 10:00 (25 saat sonra) düşer, 10:50 kalır
  assert.equal(demoSlotlariUret({ ...ayar, minOncedenSaat: 25.5 }, simdi, []).length, 1);
});

test("ics iki hatırlatma taşır, iptalde hiç taşımaz", () => {
  const e = {
    uid: "x@projelio.app",
    baslangic: "2026-09-21T07:00:00.000Z",
    bitis: "2026-09-21T07:40:00.000Z",
    baslik: "Projelio canlı demo",
    aciklama: "Satır 1\nSatır, 2",
    konum: "https://meet.google.com/abc",
  };
  const ics = demoIcsOlustur(e, simdi);
  assert.match(ics, /DTSTART:20260921T070000Z/);
  assert.match(ics, /TRIGGER:-PT1440M/);
  assert.match(ics, /TRIGGER:-PT60M/);
  assert.match(ics, /Satır 1\\nSatır\\, 2/);
  for (const satir of ics.split("\r\n")) assert.ok(new TextEncoder().encode(satir).length <= 75);
  const iptal = demoIcsOlustur({ ...e, iptal: true, sira: 2 }, simdi);
  assert.doesNotMatch(iptal, /VALARM/);
  assert.match(iptal, /METHOD:CANCEL/);
  assert.match(googleTakvimUrl(e), /dates=20260921T070000Z%2F20260921T074000Z/);
});

test("iletişim doğrulaması", () => {
  assert.ok(demoEpostaGecerli("ali@firma.com"));
  assert.ok(!demoEpostaGecerli("ali@firma"));
  assert.ok(demoTelefonGecerli("+90 (532) 000 00 00"));
  assert.ok(!demoTelefonGecerli("12345"));
});
