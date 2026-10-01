import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  KUYRUK_OMRU_MS,
  KUYRUK_TAVANI,
  bayatlariAyikla,
  bekleyenleriUygula,
  kuyrugaEkle,
  kuyrukKarari,
  onbellegeAlinirMi,
  oturumSahibi,
  sunucuyaUlasilamadiMi,
  type BekleyenYazma,
} from "./cevrimdisi";

test("sır taşıyan ve yönetici uçları cihazda saklanmaz", () => {
  assert.equal(onbellegeAlinirMi("/service-accounts/a1/credentials"), false);
  assert.equal(onbellegeAlinirMi("/service-accounts/a1/credential-views"), false);
  assert.equal(onbellegeAlinirMi("/social-credentials?accountId=x"), false);
  assert.equal(onbellegeAlinirMi("/google/picker-token"), false);
  assert.equal(onbellegeAlinirMi("/admin/users"), false);
  assert.equal(onbellegeAlinirMi("/auth/sessions"), false);
  assert.equal(onbellegeAlinirMi("/billing/subscription"), false);
});

test("olağan ekran verisi saklanır, /auth/me dahil", () => {
  assert.equal(onbellegeAlinirMi("/auth/me"), true);
  assert.equal(onbellegeAlinirMi("/todos/overview"), true);
  assert.equal(onbellegeAlinirMi("/jobs/j1/projects?archived=false"), true);
});

test("ulaşılamama: bağlantı yok ya da vekil arkasında uygulama yok", () => {
  for (const s of [0, 502, 503, 504]) assert.equal(sunucuyaUlasilamadiMi(s), true);
  for (const s of [200, 400, 401, 404, 500]) assert.equal(sunucuyaUlasilamadiMi(s), false);
});

test("kuyruk kararı: reddedilen atılır, ulaşılamayan bekler", () => {
  assert.equal(kuyrukKarari(200), "tamam");
  assert.equal(kuyrukKarari(204), "tamam");
  assert.equal(kuyrukKarari(0), "beklet");
  assert.equal(kuyrukKarari(503), "beklet");
  assert.equal(kuyrukKarari(401), "beklet");
  assert.equal(kuyrukKarari(429), "beklet");
  assert.equal(kuyrukKarari(404), "at");
  assert.equal(kuyrukKarari(403), "at");
  assert.equal(kuyrukKarari(500), "at");
});

test("jetonun sahibi okunur, bozuk jeton null döner", () => {
  const govde = Buffer.from(JSON.stringify({ sub: "u-123", email: "a@b.c" })).toString("base64url");
  assert.equal(oturumSahibi(`x.${govde}.imza`), "u-123");
  assert.equal(oturumSahibi("bozuk"), null);
  assert.equal(oturumSahibi("a.!!!.c"), null);
  assert.equal(oturumSahibi(null), null);
});

const yazma = (itemId: string, status: string, zaman = 1): BekleyenYazma => ({
  method: "PATCH",
  path: "/todos/status",
  body: { source: "personal", itemId, status },
  zaman,
});

test("aynı hedefe giden önceki yazma düşer, son hâl kalır", () => {
  let k: BekleyenYazma[] = [];
  k = kuyrugaEkle(k, yazma("a", "done"));
  k = kuyrugaEkle(k, yazma("b", "done"));
  k = kuyrugaEkle(k, yazma("a", "todo"));
  assert.deepEqual(
    k.map((y) => [(y.body as { itemId: string }).itemId, (y.body as { status: string }).status]),
    [
      ["b", "done"],
      ["a", "todo"],
    ]
  );
});

test("kuyruk tavanı aşılınca en eskiler düşer", () => {
  let k: BekleyenYazma[] = [];
  for (let i = 0; i < KUYRUK_TAVANI + 5; i++) k = kuyrugaEkle(k, yazma(`g${i}`, "done"));
  assert.equal(k.length, KUYRUK_TAVANI);
  assert.equal((k[0].body as { itemId: string }).itemId, "g5");
});

test("ömrünü doldurmuş yazma gönderilmez", () => {
  const simdi = 10 * KUYRUK_OMRU_MS;
  const k = bayatlariAyikla([yazma("eski", "done", simdi - KUYRUK_OMRU_MS - 1), yazma("yeni", "done", simdi - 1000)], simdi);
  assert.deepEqual(
    k.map((y) => (y.body as { itemId: string }).itemId),
    ["yeni"]
  );
});

test("bekleyen durum değişikliği saklı listeye yansır, olmayan alan eklenmez", () => {
  const veri = {
    gorevler: [
      { id: "t1", status: "todo", title: "A" },
      { id: "t2", status: "todo", title: "B" },
    ],
    kartlar: [{ itemId: "p1", status: "todo" }],
  };
  const sonuc = bekleyenleriUygula(veri, [
    { method: "PATCH", path: "/tasks/t2/status", body: { status: "completed" }, zaman: 1 },
    { method: "PATCH", path: "/todos/status", body: { source: "personal", itemId: "p1", status: "completed", ekstra: 1 }, zaman: 2 },
  ]);
  assert.deepEqual(sonuc, {
    gorevler: [
      { id: "t1", status: "todo", title: "A" },
      { id: "t2", status: "completed", title: "B" },
    ],
    kartlar: [{ itemId: "p1", status: "completed" }],
  });
});
