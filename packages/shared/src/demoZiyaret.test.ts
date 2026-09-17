import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  demoAnalitikHesapla,
  demoCihazSinifi,
  demoOzellikAnahtari,
  demoSayfaAnahtari,
  type DemoOlaySatiri,
  type DemoZiyaretSatiri,
} from "./demoZiyaret";

test("kimlikler sayfa anahtarına girmez, modül anahtarı kalır", () => {
  assert.equal(demoSayfaAnahtari("/projects/ce110001-0000-4000-8000-000000000001"), "/projects/:id");
  assert.equal(
    demoSayfaAnahtari("/departments/ce110001-0000-4000-8000-000000000002/modules/fm_alacak_borc?x=1"),
    "/departments/:id/modules/fm_alacak_borc"
  );
  assert.equal(demoSayfaAnahtari("/"), "/");
  assert.equal(demoSayfaAnahtari("/tasks/"), "/tasks");
});

test("sayfadan özellik", () => {
  assert.equal(demoOzellikAnahtari("/"), "pano");
  assert.equal(demoOzellikAnahtari("/jobs/:id"), "is");
  assert.equal(demoOzellikAnahtari("/jobs/:id/modules/sosyal"), "modul:sosyal");
  assert.equal(demoOzellikAnahtari("/settings/lio-units"), "lio-bakiyesi");
  assert.equal(demoOzellikAnahtari("/bilinmeyen"), null);
});

test("cihaz sınıfı", () => {
  assert.equal(demoCihazSinifi(390), "mobil");
  assert.equal(demoCihazSinifi(900), "tablet");
  assert.equal(demoCihazSinifi(1440), "masaustu");
});

const z = (id: string, basladiAt: string, kaynak: DemoZiyaretSatiri["kaynak"] = "tanitim"): DemoZiyaretSatiri => ({
  id,
  basladiAt,
  sonGorulmeAt: basladiAt,
  cihaz: "masaustu",
  kaynak,
});
const sayfa = (ziyaretId: string, at: string, anahtar: string, sureSn: number): DemoOlaySatiri => ({
  ziyaretId,
  at,
  tur: "sayfa",
  anahtar,
  sayfa: anahtar,
  sureSn,
});

test("ilk ilgi panoyu atlar; olaysız ziyaret sayılmaz", () => {
  const ziyaretler = [z("a", "2026-09-16T08:00:00"), z("b", "2026-09-16T09:00:00", null), z("c", "2026-09-16T10:00:00")];
  const olaylar: DemoOlaySatiri[] = [
    sayfa("a", "2026-09-16T08:00:01", "/", 20),
    { ziyaretId: "a", at: "2026-09-16T08:00:10", tur: "ozellik", anahtar: "lio", sayfa: "/", sureSn: null },
    sayfa("a", "2026-09-16T08:00:30", "/projects/:id", 100),
    { ziyaretId: "a", at: "2026-09-16T08:00:40", tur: "tikla", anahtar: "Görev ekle", sayfa: "/projects/:id", sureSn: null },
    { ziyaretId: "a", at: "2026-09-16T08:00:41", tur: "tikla", anahtar: "Görev ekle", sayfa: "/projects/:id", sureSn: null },
    // Sıra karışık gelse de zamana göre dizilir.
    sayfa("b", "2026-09-16T09:00:30", "/projects/:id", 10),
    sayfa("b", "2026-09-16T09:00:01", "/", 5),
  ];
  const r = demoAnalitikHesapla(ziyaretler, olaylar, 2, "2026-09-16");
  assert.equal(r.ziyaret, 2);
  // a: panodayken Lio'yu açtı → ilk ilgisi Lio. b: panodan projeye geçti.
  assert.deepEqual(r.ilkIlgi.map((s) => [s.anahtar, s.ziyaret]), [["lio", 1], ["proje", 1]]);
  assert.equal(r.ozellikler.find((s) => s.anahtar === "proje")?.ziyaret, 2);
  assert.equal(r.ortSureSn, Math.round((120 + 15) / 2));
  assert.equal(r.hemenCikma, 0);
  assert.deepEqual(r.kaynak, { tanitim: 1, giris: 0, bilinmiyor: 1 });
  assert.deepEqual(r.tiklamalar[0], { sayfa: "/projects/:id", anahtar: "Görev ekle", sayi: 2, ziyaret: 1 });
  assert.deepEqual(r.gunluk, [
    { gun: "2026-09-15", ziyaret: 0 },
    { gun: "2026-09-16", ziyaret: 2 },
  ]);
  assert.equal(r.sonZiyaretler[0].id, "b");
  assert.equal(r.sonZiyaretler[0].adimlar[0].anahtar, "/");
});

test("yalnızca panoyu gören ziyaret hemen çıkmış sayılır", () => {
  const r = demoAnalitikHesapla([z("a", "2026-09-16T08:00:00")], [sayfa("a", "2026-09-16T08:00:01", "/", 8)], 1, "2026-09-16");
  assert.equal(r.hemenCikma, 1);
  assert.equal(r.ilkIlgi.length, 0);
  assert.equal(r.medyanSureSn, 8);
});

test("Istanbul günü gece yarısı sınırında doğru", () => {
  // UTC 22:30 = İstanbul ertesi gün 01:30
  const r = demoAnalitikHesapla([z("a", "2026-09-15T22:30:00")], [sayfa("a", "2026-09-15T22:30:01", "/", 1)], 2, "2026-09-16");
  assert.deepEqual(r.gunluk.map((g) => g.ziyaret), [0, 1]);
});
