import * as assert from "node:assert/strict";
import { test } from "node:test";
import { cevaptaTaslakVar, icerikTuruSec, medyaEtiketi, taslakGosterimi, utcAn, planlamaEksikleri, zamaniCoz } from "./sosyal-lio";

test("ofsetsiz duvar saati İstanbul saatine göre UTC'ye çevrilir", () => {
  const d = zamaniCoz("2026-10-01T19:00", "Europe/Istanbul");
  assert.equal(d?.toISOString(), "2026-10-01T16:00:00.000Z");
});

test("ofsetli zaman olduğu gibi alınır", () => {
  assert.equal(zamaniCoz("2026-10-01T19:00:00+03:00")?.toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(zamaniCoz("2026-10-01T16:00:00Z")?.toISOString(), "2026-10-01T16:00:00.000Z");
});

test("çözülemeyen zaman null", () => {
  assert.equal(zamaniCoz("yarın 19"), null);
  assert.equal(zamaniCoz(""), null);
  assert.equal(zamaniCoz(undefined), null);
});

test("içerik türü: tek video reels, çok medya karusel, tek görsel görsel", () => {
  assert.equal(icerikTuruSec(["video/mp4"]), "reel");
  assert.equal(icerikTuruSec(["image/jpeg", "image/png"]), "carousel");
  assert.equal(icerikTuruSec(["image/jpeg"]), "image");
  assert.equal(icerikTuruSec(["video/mp4"], "story"), "story");
  assert.equal(icerikTuruSec(["video/mp4"], "saçma"), "reel");
});

test("planlama eksikleri", () => {
  const simdi = new Date("2026-09-30T12:00:00Z");
  const iyi = { medyaSayisi: 1, hedefSayisi: 1, caption: "x", vakit: new Date("2026-10-01T16:00:00Z"), simdi };
  assert.deepEqual(planlamaEksikleri(iyi), []);
  assert.equal(planlamaEksikleri({ ...iyi, caption: " " }).length, 1);
  assert.equal(planlamaEksikleri({ ...iyi, vakit: new Date("2026-09-30T12:01:00Z") }).length, 1);
  assert.equal(planlamaEksikleri({ ...iyi, vakit: null }).length, 1);
  assert.equal(planlamaEksikleri({ ...iyi, medyaSayisi: 0, hedefSayisi: 0 }).length, 2);
});

test("medya etiketi orijinal ile sıkıştırılmış kopyayı ayırır", () => {
  assert.equal(
    medyaEtiketi({ name: "Akor Yürüyüşü 2.1.mp4", mime_type: "video/mp4", size_bytes: 221_500_000 }),
    "Akor Yürüyüşü 2.1.mp4 · video · 211 MB · orijinal dosya"
  );
  assert.equal(
    medyaEtiketi({ name: "whatsapp-dosyasi.mp4", mime_type: "video/mp4", size_bytes: "23068672" }),
    "whatsapp-dosyasi.mp4 · video · 22 MB · WhatsApp'ın sıkıştırdığı kopya"
  );
  assert.equal(medyaEtiketi({ name: null, mime_type: "image/jpeg" }), "medya · görsel · orijinal dosya");
});

test("saat dilimsiz veritabanı damgası UTC okunur", () => {
  assert.equal(utcAn("2026-10-01T16:00:00").toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(utcAn("2026-10-01T16:00:00+00:00").toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(utcAn("2026-10-01T19:00:00+03:00").toISOString(), "2026-10-01T16:00:00.000Z");
});

test("taslak gösterimi: açıklamayı aktarmayan cevap gösterilmemiş sayılır", () => {
  const aciklama = "Satış Öğreniyorum - Bölüm 3\n\nFuarlarda networking yapmanın gücünü keşfettik.";
  // 2026-10-08: Lio düzeltmeden sonra yalnızca bunu dedi.
  assert.equal(cevaptaTaslakVar("Yeni hâli hazır. Böyle planlayayım mı?", aciklama), false);
  // Biçim işaretleri ve satır sonları farkı engel değil.
  assert.equal(
    cevaptaTaslakVar("Açıklama:\n*Satış Öğreniyorum - Bölüm 3*\nFuarlarda networking yapmanın gücünü keşfettik.", aciklama),
    true
  );
  assert.equal(cevaptaTaslakVar("Tamam.", null), true);
});

test("taslak gösterimi: sunucu bloğu hesap, tür, zaman, açıklama ve etiketleri taşır", () => {
  const metin = taslakGosterimi({
    hesaplar: ["@yigitcankiremitci"],
    icerikTuru: "reel",
    yayinZamani: "8 Ekim 2026 Perşembe 19:00",
    aciklama: "Bölüm 3",
    etiketler: "#projelio",
  });
  assert.match(metin, /Hesap: @yigitcankiremitci/);
  assert.match(metin, /Tür: Reel/);
  assert.match(metin, /19:00/);
  assert.match(metin, /Bölüm 3/);
  assert.match(metin, /Etiketler: #projelio/);
  assert.ok(cevaptaTaslakVar(metin, "Bölüm 3"));
});
