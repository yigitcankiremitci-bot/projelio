import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  gorevBitisiniTakvimOgesine,
  kisiselTakvimdeGorunurMu,
  projeEtkinligiAraliktaMi,
  projeEtkinliginiTakvimOgesine,
  type ProjeEtkinligi,
} from "./projeTakvimi";
import { saatliParcalar, tumGunGunleri } from "./googleTakvim";

const etkinlik = (ek: Partial<ProjeEtkinligi> = {}): ProjeEtkinligi => ({
  id: "e1",
  projectId: "p1",
  title: "Haftalık toplantı",
  kind: "meeting",
  eventDate: "2026-10-08",
  allDay: false,
  startsAt: "10:00",
  endsAt: "11:30",
  participantIds: [],
  createdBy: "u1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  duzenlenebilir: true,
  ...ek,
});

test("aralık: çok günlü etkinlik aralıktan önce başlasa da düşmez", () => {
  const e = { eventDate: "2026-10-01", endDate: "2026-10-06" };
  assert.equal(projeEtkinligiAraliktaMi(e, "2026-10-05", "2026-10-11"), true);
  assert.equal(projeEtkinligiAraliktaMi(e, "2026-10-07", "2026-10-13"), false);
  assert.equal(projeEtkinligiAraliktaMi({ eventDate: "2026-10-11" }, "2026-10-05", "2026-10-11"), true);
});

test("kişisel takvim: boş katılımcı listesi tüm ekip demek", () => {
  assert.equal(kisiselTakvimdeGorunurMu({ participantIds: [], createdBy: "u1" }, "u9"), true);
  assert.equal(kisiselTakvimdeGorunurMu({ participantIds: ["u2"], createdBy: "u1" }, "u9"), false);
  assert.equal(kisiselTakvimdeGorunurMu({ participantIds: ["u2"], createdBy: "u1" }, "u2"), true);
  // Yazan katılımcı listesine kendini eklemese de kendi etkinliğini görür.
  assert.equal(kisiselTakvimdeGorunurMu({ participantIds: ["u2"], createdBy: "u1" }, "u1"), true);
});

test("saatli etkinlik yazıldığı yerel saatte parçalanır", () => {
  const o = projeEtkinliginiTakvimOgesine(etkinlik());
  assert.equal(o.tumGun, false);
  assert.equal(o.kaynak, "proje");
  assert.equal(o.projeEtkinlikId, "e1");
  assert.deepEqual(saatliParcalar(o.baslangic, o.bitis), [{ gun: "2026-10-08", baslangic: "10:00", bitis: "11:30" }]);
});

test("tüm gün etkinlik: bitiş günü dahil, bir gün fazla görünmez", () => {
  const tek = projeEtkinliginiTakvimOgesine(etkinlik({ allDay: true, startsAt: undefined, endsAt: undefined }));
  assert.deepEqual(tumGunGunleri(tek.baslangic, tek.bitis), ["2026-10-08"]);
  const cok = projeEtkinliginiTakvimOgesine(
    etkinlik({ allDay: true, startsAt: undefined, endsAt: undefined, endDate: "2026-10-10" })
  );
  assert.deepEqual(tumGunGunleri(cok.baslangic, cok.bitis), ["2026-10-08", "2026-10-09", "2026-10-10"]);
});

test("görev bitişi: tarihsiz görev çizilmez, bitmiş görev soluk", () => {
  assert.equal(gorevBitisiniTakvimOgesine({ id: "t1", title: "Rapor" }), null);
  const o = gorevBitisiniTakvimOgesine({ id: "t1", title: "Rapor", deadline: "2026-10-09", status: "completed" })!;
  assert.deepEqual(tumGunGunleri(o.baslangic, o.bitis), ["2026-10-09"]);
  assert.equal(o.isleme, "yoksay");
  assert.equal(o.gorevId, "t1");
});
