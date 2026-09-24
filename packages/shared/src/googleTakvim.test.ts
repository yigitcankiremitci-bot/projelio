import { strict as assert } from "node:assert";
import { test } from "node:test";
import { etkinlikGunleri, saatliParcalar, takvimGunEkle, tumGunGunleri } from "./googleTakvim";

// Saatli parçalar yerel saate göre hesaplanıyor; testin makineden bağımsız
// olması için ISO'lar ofsetsiz (yerel) yazılıyor.

test("tüm gün: Google'ın HARİÇ bitişi bir gün fazla göstermez", () => {
  assert.deepEqual(tumGunGunleri("2026-09-24T00:00:00.000Z", "2026-09-25T00:00:00.000Z"), ["2026-09-24"]);
  assert.deepEqual(tumGunGunleri("2026-09-24T00:00:00.000Z", "2026-09-27T00:00:00.000Z"), [
    "2026-09-24",
    "2026-09-25",
    "2026-09-26",
  ]);
});

test("tüm gün: ay ve yıl sınırı", () => {
  assert.deepEqual(tumGunGunleri("2026-12-31T00:00:00.000Z", "2027-01-02T00:00:00.000Z"), ["2026-12-31", "2027-01-01"]);
  assert.equal(takvimGunEkle("2026-02-28", 1), "2026-03-01");
});

test("saatli: aynı gün tek parça", () => {
  assert.deepEqual(saatliParcalar("2026-09-24T09:00:00", "2026-09-24T10:30:00"), [
    { gun: "2026-09-24", baslangic: "09:00", bitis: "10:30" },
  ]);
});

test("saatli: gece yarısını aşan etkinlik iki güne bölünür", () => {
  assert.deepEqual(saatliParcalar("2026-09-24T23:00:00", "2026-09-25T01:00:00"), [
    { gun: "2026-09-24", baslangic: "23:00", bitis: "23:59" },
    { gun: "2026-09-25", baslangic: "00:00", bitis: "01:00" },
  ]);
});

test("saatli: tam gece yarısında biten etkinlik ertesi güne boş parça bırakmaz", () => {
  assert.deepEqual(saatliParcalar("2026-09-24T22:00:00", "2026-09-25T00:00:00"), [
    { gun: "2026-09-24", baslangic: "22:00", bitis: "23:59" },
  ]);
});

test("etkinlikGunleri iki türü de kapsar", () => {
  assert.deepEqual(
    etkinlikGunleri({ baslangic: "2026-09-24T00:00:00.000Z", bitis: "2026-09-26T00:00:00.000Z", tumGun: true }),
    ["2026-09-24", "2026-09-25"]
  );
  assert.deepEqual(etkinlikGunleri({ baslangic: "2026-09-24T10:00:00", bitis: "2026-09-24T11:00:00", tumGun: false }), [
    "2026-09-24",
  ]);
});
