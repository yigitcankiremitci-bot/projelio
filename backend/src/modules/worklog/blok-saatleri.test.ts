import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { blokAraligi, dakikayiSaate, saatiDakikaya } from "./blok-saatleri";

// Bu hesap, Yaptım kaydının takvimde nereye oturacağını belirliyor. Buradaki
// bir gerileme kullanıcının gününü yanlış saatlerle dolduruyor ve yanlışı
// ancak takvime bakınca fark ediyor.

describe("blokAraligi", () => {
  test("kullanıcı aralık verdiyse aynen o kullanılır", () => {
    assert.deepEqual(
      blokAraligi({ doneAt: "2026-09-10T18:00:00", startedAt: "2026-09-10T09:00:00", endedAt: "2026-09-10T10:30:00" }, 90),
      { baslangic: "09:00", bitis: "10:30" }
    );
  });

  test("gün aşan aralık takvime konamaz", () => {
    // 23:30–00:15: plan_time_blocks'un time kolonları bunu ifade edemiyor.
    // Kayıt yine de tam olarak duruyor, yalnızca takvimde görünmüyor.
    assert.equal(
      blokAraligi({ doneAt: "2026-09-10T23:30:00", startedAt: "2026-09-10T23:30:00", endedAt: "2026-09-11T00:15:00" }, 45),
      null
    );
  });

  test("yalnızca süre varsa kaydın girildiği andan geriye sayılır", () => {
    assert.deepEqual(blokAraligi({ doneAt: "2026-09-10T16:00:00" }, 90), {
      baslangic: "14:30",
      bitis: "16:00",
    });
    assert.deepEqual(blokAraligi({ doneAt: "2026-09-10T09:45:00" }, 45), {
      baslangic: "09:00",
      bitis: "09:45",
    });
  });

  test("geriye sayım gün başını aşıyorsa blok üretilmez", () => {
    // 00:30'da girilen 2 saatlik iş bir önceki güne taşardı. 00:00'a KIRPMAK
    // iki saatlik işi takvimde yarım saat gösterirdi — sessiz bir yalan.
    assert.equal(blokAraligi({ doneAt: "2026-09-10T00:30:00" }, 120), null);
  });

  test("süresiz kayıt takvime konmaz", () => {
    assert.equal(blokAraligi({ doneAt: "2026-09-10T16:00:00" }, null), null);
    assert.equal(blokAraligi({ doneAt: "2026-09-10T16:00:00" }, 0), null);
  });

  test("gece yarısında girilen kayıt sıfır uzunlukta blok üretmez", () => {
    assert.equal(blokAraligi({ doneAt: "2026-09-10T00:00:00" }, 30), null);
  });

  test("tam gün başında biten iş sınırda geçerli", () => {
    assert.deepEqual(blokAraligi({ doneAt: "2026-09-10T02:00:00" }, 120), {
      baslangic: "00:00",
      bitis: "02:00",
    });
  });
});

describe("saat çevrimleri", () => {
  test("ileri geri aynı değeri verir", () => {
    assert.equal(saatiDakikaya("09:30"), 570);
    assert.equal(dakikayiSaate(570), "09:30");
    assert.equal(dakikayiSaate(0), "00:00");
    assert.equal(dakikayiSaate(1439), "23:59");
  });
});
