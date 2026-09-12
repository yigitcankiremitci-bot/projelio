import { strict as assert } from "node:assert";
import { test } from "node:test";
import { adminKullaniciDurumu, krediHareketiGeriAlinabilirMi } from "./adminKullanici";

const temel = { anonimlestirildi: false, deletedAt: null, bannedAt: null, emailVerifiedAt: "2026-01-01" };

test("doğrulanmış, engelsiz hesap aktif", () => {
  assert.equal(adminKullaniciDurumu(temel), "aktif");
});

test("e-postası doğrulanmamış hesap", () => {
  assert.equal(adminKullaniciDurumu({ ...temel, emailVerifiedAt: null }), "dogrulanmamis");
});

test("askı, doğrulanmamışlıktan önce gelir", () => {
  assert.equal(adminKullaniciDurumu({ ...temel, emailVerifiedAt: null, bannedAt: "x" }), "askida");
});

test("silme talebi askıdan önce gelir", () => {
  assert.equal(adminKullaniciDurumu({ ...temel, bannedAt: "x", deletedAt: "y" }), "silinecek");
});

test("anonimleştirilmiş hesap her şeyden önce silindi sayılır", () => {
  assert.equal(adminKullaniciDurumu({ ...temel, anonimlestirildi: true, deletedAt: "y" }), "silindi");
});

const yukleme = { type: "topup" as const, credits: 100, reversesTransactionId: undefined, geriAlindi: false };

test("pozitif yükleme geri alınabilir", () => {
  assert.equal(krediHareketiGeriAlinabilirMi(yukleme), true);
});

test("harcama geri alınamaz", () => {
  assert.equal(krediHareketiGeriAlinabilirMi({ ...yukleme, type: "usage", credits: -5 }), false);
});

test("zaten geri alınmış yükleme ikinci kez geri alınamaz", () => {
  assert.equal(krediHareketiGeriAlinabilirMi({ ...yukleme, geriAlindi: true }), false);
});

test("geri alma satırının kendisi geri alınamaz", () => {
  assert.equal(krediHareketiGeriAlinabilirMi({ ...yukleme, type: "adjustment", credits: -100, reversesTransactionId: "t1" }), false);
});

test("negatif düzeltme (elle düşme) geri alınamaz", () => {
  assert.equal(krediHareketiGeriAlinabilirMi({ ...yukleme, type: "adjustment", credits: -20 }), false);
});
