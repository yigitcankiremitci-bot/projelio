import * as assert from "node:assert/strict";
import { test } from "node:test";
import { icerikTuruSec, planlamaEksikleri, zamaniCoz } from "./sosyal-lio";

test("ofsetsiz duvar saati İstanbul saatine göre UTC'ye çevrilir", () => {
  const d = zamaniCoz("2026-10-01T19:00", "Europe/Istanbul");
  assert.equal(d?.toISOString(), "2026-10-01T16:00:00.000Z");
});

test("ofsetli zaman olduğu gibi alınır", () => {
  assert.equal(zamaniCoz("2026-10-01T19:00:00+03:00")?.toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(zamaniCoz("2026-10-01T16:00:00Z")?.toISOString(), "2026-10-01T16:00:00.000Z");
});

test("çözülemeyen zaman null", () => {
  assert.equal(zamaniCoz("yarın 19"), null);
  assert.equal(zamaniCoz(""), null);
  assert.equal(zamaniCoz(undefined), null);
});

test("içerik türü: tek video reels, çok medya karusel, tek görsel görsel", () => {
  assert.equal(icerikTuruSec(["video/mp4"]), "reel");
  assert.equal(icerikTuruSec(["image/jpeg", "image/png"]), "carousel");
  assert.equal(icerikTuruSec(["image/jpeg"]), "image");
  assert.equal(icerikTuruSec(["video/mp4"], "story"), "story");
  assert.equal(icerikTuruSec(["video/mp4"], "saçma"), "reel");
});

test("planlama eksikleri", () => {
  const simdi = new Date("2026-09-30T12:00:00Z");
  const iyi = { medyaSayisi: 1, hedefSayisi: 1, caption: "x", vakit: new Date("2026-10-01T16:00:00Z"), simdi };
  assert.deepEqual(planlamaEksikleri(iyi), []);
  assert.equal(planlamaEksikleri({ ...iyi, caption: " " }).length, 1);
  assert.equal(planlamaEksikleri({ ...iyi, vakit: new Date("2026-09-30T12:01:00Z") }).length, 1);
  assert.equal(planlamaEksikleri({ ...iyi, vakit: null }).length, 1);
  assert.equal(planlamaEksikleri({ ...iyi, medyaSayisi: 0, hedefSayisi: 0 }).length, 2);
});
