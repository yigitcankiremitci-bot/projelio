import { test } from "node:test";
import assert from "node:assert/strict";
import { ayricalikDogrula } from "./ayricalik";
import { modulHakkiDurumu, modulEklenebilirMi } from "./modulHakki";
import { departmanAcilabilirMi, departmanSiniri } from "./departmanKurali";

test("ayrıcalık: ek modül paketin üstüne eklenir", () => {
  const durum = modulHakkiDurumu("free", ["a", "b"], { ekstraModul: 3, sinirsizModul: false });
  assert.equal(durum.hak, 5);
  assert.equal(durum.kalan, 3);
  assert.deepEqual(modulEklenebilirMi(durum, ["a", "b"], ["c", "d", "e"]), { eklenebilir: true });
  assert.equal(modulEklenebilirMi(durum, ["a", "b"], ["c", "d", "e", "f"]).eklenebilir, false);
});

test("ayrıcalık: sınırsız modül paketi sınırsız yapar", () => {
  assert.equal(modulHakkiDurumu("starter", [], { ekstraModul: 0, sinirsizModul: true }).hak, null);
});

test("ayrıcalık: ek departman küçük şirket sınırını yükseltir ama boş departmana izin vermez", () => {
  // Yönetici + 1 kişi, 1 departman var: normalde ikincisi açılmaz.
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 1, kisiSayisiSonra: 1 }).acilabilir, false);
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 1, kisiSayisiSonra: 1, ekstraDepartman: 2 }).acilabilir, true);
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 3, kisiSayisiSonra: 1, ekstraDepartman: 2 }).acilabilir, false);
  assert.equal(departmanAcilabilirMi({ departmanSayisi: 0, kisiSayisiSonra: 0, ekstraDepartman: 5 }).acilabilir, false);
  assert.equal(departmanSiniri(2, 3), 5);
});

test("ayrıcalık: girdi doğrulaması", () => {
  assert.ok("hata" in ayricalikDogrula({ ekstraModul: -1 }));
  assert.ok("hata" in ayricalikDogrula({ ekstraKisi: 1.5 }));
  assert.ok("hata" in ayricalikDogrula({ ekstraDepartman: 501 }));
  const ok = ayricalikDogrula({ ekstraModul: "2", sinirsizModul: true, not: "  pilot  " });
  assert.ok("ayricalik" in ok && ok.ayricalik.ekstraModul === 2 && ok.ayricalik.not === "pilot");
});
