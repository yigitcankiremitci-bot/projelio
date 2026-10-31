import { test } from "node:test";
import assert from "node:assert/strict";
import type { DepartmanGecisiDurumu } from "./departmanKurali";
import { departmanAcilabilirMi, departmanKuraliDurumu, departmanSayilirMi, departmanSiniri, gecisSeciminiDogrula } from "./departmanKurali";

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

test("Yönetim sayılmaz; sınır 10 kişide kalkar", () => {
  assert.equal(departmanSayilirMi("yonetim"), false);
  assert.equal(departmanSayilirMi("finans"), true);
  assert.equal(departmanSayilirMi(undefined), true);
  assert.equal(departmanSiniri(0), 0);
  assert.equal(departmanSiniri(8), 8);
  assert.equal(departmanSiniri(9), null);
});

const gecis = (over: Partial<DepartmanGecisiDurumu> = {}): DepartmanGecisiDurumu => ({
  organizationId: "o",
  organizationName: "Acme",
  departmanlar: [
    { id: "satis", name: "Satış", kisiSayisi: 2, gorevSayisi: 4, dosyaSayisi: 0 },
    { id: "finans", name: "Finans", kisiSayisi: 1, gorevSayisi: 0, dosyaSayisi: 3 },
    { id: "ik", name: "İK", kisiSayisi: 0, gorevSayisi: 1, dosyaSayisi: 0 },
  ],
  kisiSayisi: 2,
  sinir: 2,
  yonetimVar: false,
  ...over,
});

test("geçiş: kişisi olan departmanlar sınır kadar tutulur", () => {
  assert.equal(gecisSeciminiDogrula(gecis(), ["satis", "finans"]), null);
  assert.equal(gecisSeciminiDogrula(gecis(), []), null);
  assert.match(gecisSeciminiDogrula(gecis({ sinir: 1, kisiSayisi: 1 }), ["satis", "finans"]) ?? "", /en çok 1/);
});

test("geçiş: boş departman tutulamaz, yabancı kimlik reddedilir", () => {
  assert.match(gecisSeciminiDogrula(gecis(), ["ik"]) ?? "", /kimse yok/);
  assert.equal(gecisSeciminiDogrula(gecis(), ["baska"]), "Seçilen departmanlardan biri bu şirkette yok.");
});
