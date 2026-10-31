import { test } from "node:test";
import assert from "node:assert/strict";
import { departmanAcilabilirMi, departmanKuraliDurumu } from "./departmanKurali";

test("yönetici dışında kimse yoksa departman açılamaz", () => {
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 0, kisiSayisiSonra: 0 }).acilabilir, false);
});

test("ilk kişiyle ilk departman açılır", () => {
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 0, kisiSayisiSonra: 1 }).acilabilir, true);
});

test("küçük şirkette departman sayısı kişi sayısını geçemez", () => {
  // Yönetici + 2 kişi, 2 departman var: üçüncüsü açılamaz.
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 2, kisiSayisiSonra: 2 }).acilabilir, false);
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 1, kisiSayisiSonra: 2 }).acilabilir, true);
  // Yeni biriyle açılırsa kişi sayısı da artar.
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 2, kisiSayisiSonra: 3 }).acilabilir, true);
});

test("10 kişi ve üstünde sayı sınırı yok", () => {
  // Yönetici + 9 kişi = 10.
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 15, kisiSayisiSonra: 9 }).acilabilir, true);
  // Yönetici + 8 kişi = 9: hâlâ sınırlı.
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 8, kisiSayisiSonra: 8 }).acilabilir, false);
});

test("eski boş departmanlar sayılır ama silinmez: yeni açılışı engeller", () => {
  // Kural öncesi 6 boş departman açmış, 1 çalışanı olan şirket.
  const d = departmanKuraliDurumu(6, 1);
  assert.equal(d.mevcutKisiyle.acilabilir, false);
  assert.equal(d.yeniKisiyle.acilabilir, false);
});

test("durum: mevcut kişiyle ve yeni kişiyle ayrı ayrı", () => {
  const d = departmanKuraliDurumu(1, 1);
  assert.equal(d.mevcutKisiyle.acilabilir, false);
  assert.equal(d.yeniKisiyle.acilabilir, true);
});
