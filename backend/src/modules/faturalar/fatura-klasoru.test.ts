import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ayAnahtari, ayKlasorAdi, ayKlasorYolu, buAy, ekYolu } from "./fatura-klasoru";

test("ay anahtarı yalnızca yıl-ay alır", () => {
  assert.equal(ayAnahtari("2026-09-14"), "2026-09");
  assert.equal(ayAnahtari("2026-09-14T10:00:00.000Z"), "2026-09");
  assert.equal(ayAnahtari("  2026-01-01  "), "2026-01");
});

test("okunamayan tarihler undefined döner", () => {
  assert.equal(ayAnahtari(""), undefined);
  assert.equal(ayAnahtari("14.09.2026"), undefined);
  assert.equal(ayAnahtari(undefined), undefined);
  assert.equal(ayAnahtari(20260914), undefined);
  // 13. ay: yazım hatası olan bir kayıt arşivde olmayan bir klasör açmasın.
  assert.equal(ayAnahtari("2026-13-01"), undefined);
});

test("ay klasörü hem sıralanır hem okunur", () => {
  assert.equal(ayKlasorAdi("2026-09"), "2026-09 Eylül");
  assert.equal(ayKlasorAdi("2026-01"), "2026-01 Ocak");
  assert.equal(ayKlasorAdi("2025-12"), "2025-12 Aralık");
});

test("yükleme yolu fatura tarihinin ayına iner", () => {
  assert.equal(ekYolu("Faturalar", "2026-03-02", "fis.pdf"), "Faturalar/2026/2026-03 Mart/fis.pdf");
});

test("tarihi okunamayan belge bugünün ayına düşer, kapsam dışı kalmaz", () => {
  const beklenen = `Faturalar/${buAy().slice(0, 4)}/${ayKlasorAdi(buAy())}/fis.pdf`;
  assert.equal(ekYolu("Faturalar", "", "fis.pdf"), beklenen);
});

test("arşiv klasör zinciri yükleme yoluyla aynı adları üretir", () => {
  const zincir = ayKlasorYolu("Faturalar", "2026-03");
  assert.deepEqual(zincir, ["Faturalar", "2026", "2026-03 Mart"]);
  // Yükleme yolu bu zincirin altına iniyor olmalı; ayrışırlarsa arşiv boş çıkar.
  assert.ok(ekYolu("Faturalar", "2026-03-02", "fis.pdf").startsWith(zincir.join("/") + "/"));
});
