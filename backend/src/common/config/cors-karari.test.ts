import * as assert from "node:assert/strict";
import { test } from "node:test";
import { corsKarari } from "./cors-karari";

const app = ["https://app.projelio.app"];
const landing = ["https://projelio.app", "https://www.projelio.app"];

test("landing yalnızca demo uçlarına, çerezsiz açılır", () => {
  const k = corsKarari("https://projelio.app", "/public/demo/musaitlik", app, landing);
  assert.deepEqual(k.origin, ["https://projelio.app"]);
  assert.equal(k.credentials, false);
});

test("landing başka bir uca gelirse genel kural geçerli (landing listede yok)", () => {
  const k = corsKarari("https://projelio.app", "/auth/me", app, landing);
  assert.deepEqual(k.origin, app);
  assert.equal(k.credentials, true);
});

test("uygulama kendi ön yüzü demo uçlarında da çerezli kalır", () => {
  const k = corsKarari("https://app.projelio.app", "/public/demo/randevu", app, landing);
  assert.equal(k.credentials, true);
});

test("yabancı kaynak demo uçlarına açılmaz", () => {
  const k = corsKarari("https://kotu.example", "/public/demo/randevu", app, landing);
  assert.deepEqual(k.origin, app);
});

test("yol öneki birebir: /public/demo-x eşleşmez", () => {
  assert.equal(corsKarari("https://projelio.app", "/public/demox", app, landing).credentials, true);
});
