import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ADMIN_MESAJ_SINIRI,
  adminKullaniciDurumu,
  adminMesajiniDogrula,
  adminMesajLinkiGecerliMi,
  etkinlikSuresiYaz,
  gercekEpostaMi,
  gunlukEtkinligiDoldur,
  krediHareketiGeriAlinabilirMi,
} from "./adminKullanici";

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

test("süre biçimi", () => {
  assert.equal(etkinlikSuresiYaz(0), "—");
  assert.equal(etkinlikSuresiYaz(undefined), "—");
  assert.equal(etkinlikSuresiYaz(42), "42 sn");
  assert.equal(etkinlikSuresiYaz(12 * 60), "12 dk");
  assert.equal(etkinlikSuresiYaz(3 * 3600 + 20 * 60), "3 sa 20 dk");
  assert.equal(etkinlikSuresiYaz(2 * 3600), "2 sa");
  assert.equal(etkinlikSuresiYaz(41 * 3600 + 5 * 60), "41 sa");
});

test("günlük etkinlik boş günlerle 30 güne tamamlanır, ay sınırını geçer", () => {
  const dizi = gunlukEtkinligiDoldur([{ gun: "2026-09-01", saniye: 600 }, { gun: "2026-08-20", saniye: 60 }], "2026-09-02");
  assert.equal(dizi.length, 30);
  assert.equal(dizi[29].gun, "2026-09-02");
  assert.equal(dizi[28].saniye, 600);
  assert.equal(dizi[0].gun, "2026-08-04");
  assert.equal(dizi.find((g) => g.gun === "2026-08-20")?.saniye, 60);
  assert.equal(dizi.reduce((a, g) => a + g.saniye, 0), 660);
});

test("mesaj doğrulaması: kanal, başlık, mesaj zorunlu", () => {
  assert.deepEqual(adminMesajiniDogrula({ baslik: "a", mesaj: "b" }), { hata: "En az bir kanal seç: bildirim ya da e-posta." });
  assert.deepEqual(adminMesajiniDogrula({ bildirim: true, baslik: "  ", mesaj: "b" }), { hata: "Başlık boş olamaz." });
  assert.deepEqual(adminMesajiniDogrula({ bildirim: true, baslik: "a", mesaj: "" }), { hata: "Mesaj boş olamaz." });
  assert.deepEqual(adminMesajiniDogrula({ eposta: true, baslik: " Duyuru ", mesaj: " Merhaba ", link: "" }), {
    temiz: { bildirim: false, eposta: true, baslik: "Duyuru", mesaj: "Merhaba", link: undefined },
  });
});

test("mesaj doğrulaması: uzunluk sınırları", () => {
  assert.ok("hata" in adminMesajiniDogrula({ bildirim: true, baslik: "x".repeat(ADMIN_MESAJ_SINIRI.baslik + 1), mesaj: "b" }));
  assert.ok("temiz" in adminMesajiniDogrula({ bildirim: true, baslik: "x".repeat(ADMIN_MESAJ_SINIRI.baslik), mesaj: "b" }));
  assert.ok("hata" in adminMesajiniDogrula({ bildirim: true, baslik: "a", mesaj: "x".repeat(ADMIN_MESAJ_SINIRI.mesaj + 1) }));
});

test("mesaj bağlantısı: iç yol ve https kabul, diğerleri ret", () => {
  assert.equal(adminMesajLinkiGecerliMi("/settings?sekme=destek"), true);
  assert.equal(adminMesajLinkiGecerliMi("https://projelio.app/fiyatlar"), true);
  assert.equal(adminMesajLinkiGecerliMi("//evil.com"), false);
  assert.equal(adminMesajLinkiGecerliMi("/\\evil.com"), false);
  assert.equal(adminMesajLinkiGecerliMi("http://projelio.app"), false);
  assert.equal(adminMesajLinkiGecerliMi("javascript:alert(1)"), false);
  assert.equal(adminMesajLinkiGecerliMi("https://localhost"), false);
  assert.equal(adminMesajLinkiGecerliMi("projelio.app"), false);
});

test("gerçek e-posta: demo ve silinmiş alan adları elenir", () => {
  assert.equal(gercekEpostaMi("ali@gmail.com"), true);
  assert.equal(gercekEpostaMi("ceo@celikhan.test"), false);
  assert.equal(gercekEpostaMi("silinmis+ab12cd34@projelio.invalid"), false);
  assert.equal(gercekEpostaMi("a@example.com"), false);
  assert.equal(gercekEpostaMi(""), false);
});
