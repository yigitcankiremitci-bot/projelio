import { strict as assert } from "node:assert";
import { test } from "node:test";
import { kampanyaGirdisiniDogrula, kampanyaTekilMi, maliyetTopla, planlananAniDogrula } from "./epostaYonetimi";

const ID = "11111111-2222-4333-8444-555555555555";
const temel = { konu: "K", baslik: "B", govde: "G", lioIle: false, hedef: { tur: "herkes" as const } };

test("geçerli kampanya temizlenir", () => {
  const s = kampanyaGirdisiniDogrula({ ...temel, konu: "  K  ", link: "/tasks", dugme: "Aç" });
  assert.ok("temiz" in s);
  if ("temiz" in s) {
    assert.equal(s.temiz.konu, "K");
    assert.equal(s.temiz.link, "/tasks");
  }
});

test("zorunlu alanlar ve bağlantı kuralı", () => {
  assert.ok("hata" in kampanyaGirdisiniDogrula({ ...temel, konu: "" }));
  assert.ok("hata" in kampanyaGirdisiniDogrula({ ...temel, govde: " " }));
  assert.ok("hata" in kampanyaGirdisiniDogrula({ ...temel, link: "//evil.com", dugme: "x" }));
  assert.ok("hata" in kampanyaGirdisiniDogrula({ ...temel, link: "/tasks" }), "düğmesiz bağlantı");
});

test("kitle doğrulaması", () => {
  assert.ok("hata" in kampanyaGirdisiniDogrula({ ...temel, hedef: { tur: "yeni", gun: 0 } }));
  assert.ok("temiz" in kampanyaGirdisiniDogrula({ ...temel, hedef: { tur: "pasif", gun: 7 } }));
  assert.ok("hata" in kampanyaGirdisiniDogrula({ ...temel, hedef: { tur: "secili", kullaniciIds: ["x"] } }));
  assert.ok("hata" in kampanyaGirdisiniDogrula({ ...temel, hedef: undefined as any }));
});

test("seçili kişiler tekilleştirilir; tek kişi tekil gönderimdir", () => {
  const s = kampanyaGirdisiniDogrula({ ...temel, hedef: { tur: "secili", kullaniciIds: [ID, ID] } });
  assert.ok("temiz" in s && s.temiz.hedef.tur === "secili" && s.temiz.hedef.kullaniciIds.length === 1);
  if ("temiz" in s) assert.equal(kampanyaTekilMi(s.temiz.hedef), true);
  assert.equal(kampanyaTekilMi({ tur: "herkes" }), false);
});

test("maliyet toplamı", () => {
  const k = maliyetTopla([
    { inputTokens: 100, outputTokens: 50, maliyetUsd: 0.001, birim: 12.35 },
    { inputTokens: 200, outputTokens: 10, maliyetUsd: 0.002, birim: 7 },
  ]);
  assert.deepEqual(k, { adet: 2, inputTokens: 300, outputTokens: 60, maliyetUsd: 0.003, birim: 19.35 });
});

test("planlanan an: boş = hemen, geçmiş ve çok ileri reddedilir", () => {
  const simdi = new Date("2026-09-19T10:00:00Z");
  assert.deepEqual(planlananAniDogrula(undefined, simdi), { temiz: undefined });
  assert.deepEqual(planlananAniDogrula("2026-09-20T07:00:00.000Z", simdi), { temiz: "2026-09-20T07:00:00.000Z" });
  assert.ok("temiz" in planlananAniDogrula("2026-09-19T09:55:00Z", simdi), "birkaç dakikalık geçmiş kabul");
  assert.ok("hata" in planlananAniDogrula("2026-09-18T10:00:00Z", simdi));
  assert.ok("hata" in planlananAniDogrula("2026-12-30T10:00:00Z", simdi));
  assert.ok("hata" in planlananAniDogrula("yarın", simdi));
});
