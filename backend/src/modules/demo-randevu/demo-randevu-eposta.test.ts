import { strict as assert } from "node:assert";
import { test } from "node:test";
import { demoEkipEpostasi, demoIcsDosyasi, demoKatilimciEpostasi, demoZamanMetni, type DemoEpostaRandevusu } from "./demo-randevu-eposta";

const r: DemoEpostaRandevusu = {
  id: "11111111-1111-4111-8111-111111111111",
  baslangic: "2026-09-21T07:00:00.000Z",
  bitis: "2026-09-21T07:40:00.000Z",
  ad: "Ayşe <b>Yılmaz</b>",
  eposta: "ayse@firma.com",
  telefon: "+90 532 000 00 00",
  sirket: null,
  ekipBuyuklugu: "6-20",
  not: "Bütçe modülü",
  dil: "tr",
  saatDilimi: "Europe/Istanbul",
  toplantiLinki: null,
  sunucuAdi: null,
  takvimSirasi: 0,
  uye: false,
};
const a = {
  yonetimUrl: "https://app.projelio.app/demo-randevu/tok",
  icsUrl: "https://app.projelio.app/demo-randevu/tok?takvim=ics",
  kayitUrl: "https://app.projelio.app/register?email=ayse%40firma.com",
  adminUrl: "https://app.projelio.app/admin?sekme=demoRandevu",
};

test("zaman İstanbul saatiyle yazılır", () => {
  assert.equal(demoZamanMetni(r, "tr"), "21 Eylül 2026 Pazartesi, 10:00–10:40 (Türkiye saati)");
});

test("üye olmayana hesap çağrısı ve iki takvim düğmesi gider; ad kaçırılır", () => {
  const m = demoKatilimciEpostasi("alindi", r, a);
  assert.match(m.html, /register\?email=ayse%40firma\.com/);
  assert.match(m.html, /calendar\.google\.com/);
  assert.match(m.html, /takvim=ics/);
  assert.doesNotMatch(m.html, /<b>Yılmaz/);
  const uye = demoKatilimciEpostasi("alindi", { ...r, uye: true }, a);
  assert.doesNotMatch(uye.html, /register\?email/);
});

test("iptal e-postası takvime ekletmez, yeni saat seçtirir", () => {
  const m = demoKatilimciEpostasi("iptal", r, a);
  assert.doesNotMatch(m.html, /calendar\.google\.com/);
  assert.match(m.html, /demo-randevu\/tok/);
});

test("İngilizce randevu İngilizce yazılır", () => {
  const m = demoKatilimciEpostasi("alindi", { ...r, dil: "en" }, a);
  assert.match(m.subject, /demo/i);
  assert.doesNotMatch(m.subject, /randevunuz/);
});

test("ekip e-postası kişi bilgilerini taşır, ics iki alarm içerir", () => {
  const m = demoEkipEpostasi("yeni", r, a);
  assert.match(m.html, /\+90 532 000 00 00/);
  assert.match(m.html, /Üye değil/);
  const ics = demoIcsDosyasi(r, a.yonetimUrl, new Date("2026-09-19T00:00:00Z"));
  assert.equal(ics.match(/BEGIN:VALARM/g)?.length, 2);
  assert.match(ics, /UID:demo-11111111-1111-4111-8111-111111111111@projelio\.app/);
});
