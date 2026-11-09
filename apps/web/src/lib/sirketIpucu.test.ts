import { test } from "node:test";
import assert from "node:assert/strict";
import { IPUCU_ARALIGI, IPUCU_SURESI, sirketIpucuKarari } from "./sirketIpucu";

const taban = { sirketSayisi: 0, isSayisi: 3, simdi: 1_000_000 };

test("şirketi olana ya da yeni başlayana çıkmaz", () => {
  assert.equal(sirketIpucuKarari({ ...taban, sirketSayisi: 1, kayit: {} }).goster, false);
  assert.equal(sirketIpucuKarari({ ...taban, isSayisi: 1, kayit: {} }).goster, false);
});

test("ilk görünmede başlangıcı yazar", () => {
  const sonuc = sirketIpucuKarari({ ...taban, kayit: {} });
  assert.equal(sonuc.goster, true);
  assert.equal(sonuc.kayit.baslangic, taban.simdi);
});

test("bir gün görünür, sonra hafta dolana kadar gizlenir", () => {
  const kayit = { baslangic: taban.simdi };
  assert.equal(sirketIpucuKarari({ ...taban, kayit, simdi: taban.simdi + IPUCU_SURESI - 1 }).goster, true);
  assert.equal(sirketIpucuKarari({ ...taban, kayit, simdi: taban.simdi + IPUCU_SURESI }).goster, false);
  assert.equal(sirketIpucuKarari({ ...taban, kayit, simdi: taban.simdi + IPUCU_ARALIGI }).goster, true);
});

test("kapatılınca o hafta gelmez, sonraki hafta gelir", () => {
  const kayit = { baslangic: taban.simdi, kapandi: taban.simdi + 10 };
  assert.equal(sirketIpucuKarari({ ...taban, kayit, simdi: taban.simdi + 20 }).goster, false);
  assert.equal(sirketIpucuKarari({ ...taban, kayit, simdi: taban.simdi + IPUCU_ARALIGI }).goster, true);
});
