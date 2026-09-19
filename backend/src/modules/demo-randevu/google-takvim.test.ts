import * as assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { DEMO_TAKVIM_IZNI, etkinligiSil, etkinlikSaatiniGuncelle, meetEtkinligiAc, takvimIzniVerildi } from "./google-takvim";

type Cagri = { url: string; method: string; body: any; yetki: string };
let cagrilar: Cagri[] = [];
let yanitlar: Array<{ status: number; body: unknown }> = [];
const asilFetch = globalThis.fetch;

beforeEach(() => {
  cagrilar = [];
  yanitlar = [];
  globalThis.fetch = (async (url: string, init: any) => {
    cagrilar.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body) : null,
      yetki: init?.headers?.Authorization,
    });
    const y = yanitlar.shift() ?? { status: 200, body: {} };
    return new Response(y.status === 204 ? null : JSON.stringify(y.body), { status: y.status });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = asilFetch;
});

const etkinlik = {
  baslangic: "2026-09-21T07:00:00.000Z",
  bitis: "2026-09-21T07:40:00.000Z",
  baslik: "Projelio canlı demo · Ayşe",
  aciklama: "Projelio ekibiyle 40 dakikalık canlı tanıtım görüşmesi.",
  katilimciEposta: "ayse@firma.com",
  icalUid: "demo-1@projelio.app",
};

test("Meet'li etkinlik açılır: davetli var, Google daveti gönderilmez", async () => {
  yanitlar.push({ status: 200, body: { id: "e1", hangoutLink: "https://meet.google.com/abc-defg-hij" } });
  const sonuc = await meetEtkinligiAc("erisim", etkinlik);
  assert.deepEqual(sonuc, { etkinlikId: "e1", link: "https://meet.google.com/abc-defg-hij" });
  const c = cagrilar[0];
  assert.equal(c.method, "POST");
  assert.equal(c.yetki, "Bearer erisim");
  assert.match(c.url, /conferenceDataVersion=1/);
  assert.match(c.url, /sendUpdates=none/);
  assert.equal(c.body.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.deepEqual(c.body.attendees, [{ email: "ayse@firma.com" }]);
  assert.equal(c.body.iCalUID, "demo-1@projelio.app");
  assert.equal(c.body.start.dateTime, etkinlik.baslangic);
  assert.deepEqual(
    c.body.reminders.overrides.map((o: { minutes: number }) => o.minutes),
    [1440, 60]
  );
});

test("iCalUID çakışınca UID'siz yeniden denenir", async () => {
  yanitlar.push({ status: 409, body: {} }, { status: 200, body: { id: "e2", hangoutLink: "https://meet.google.com/x" } });
  const sonuc = await meetEtkinligiAc("erisim", etkinlik);
  assert.deepEqual(sonuc, { etkinlikId: "e2", link: "https://meet.google.com/x" });
  assert.equal(cagrilar.length, 2);
  assert.equal(cagrilar[1].body.iCalUID, undefined);
});

test("Meet odası üretilmezse etkinlik silinir ve hata döner", async () => {
  yanitlar.push({ status: 200, body: { id: "e3" } }, { status: 200, body: { id: "e3" } }, { status: 204, body: null });
  const sonuc = await meetEtkinligiAc("erisim", etkinlik);
  assert.ok("hata" in sonuc);
  assert.equal(cagrilar.at(-1)?.method, "DELETE");
});

test("Google reddederse hata döner, bağlantı uydurulmaz", async () => {
  yanitlar.push({ status: 403, body: { error: "forbidden" } }, { status: 403, body: { error: "forbidden" } });
  const sonuc = await meetEtkinligiAc("erisim", etkinlik);
  assert.ok("hata" in sonuc && sonuc.hata.includes("403"));
});

test("taşıma yalnızca saati değiştirir; silinmiş etkinlik hata sayılmaz", async () => {
  assert.equal(await etkinlikSaatiniGuncelle("erisim", "e1", "2026-09-22T07:00:00.000Z", "2026-09-22T07:40:00.000Z"), true);
  assert.equal(cagrilar[0].method, "PATCH");
  assert.deepEqual(Object.keys(cagrilar[0].body), ["start", "end"]);
  yanitlar.push({ status: 410, body: {} });
  assert.equal(await etkinligiSil("erisim", "e1"), true);
});

test("takvim izni işaretsiz bırakılırsa bağlantı sayılmaz", () => {
  assert.equal(takvimIzniVerildi(["openid", "email"]), false);
  assert.equal(takvimIzniVerildi(["openid", DEMO_TAKVIM_IZNI]), true);
});
