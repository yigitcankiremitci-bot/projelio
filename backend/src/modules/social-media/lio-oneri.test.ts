// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  etiketleriDuzenle,
  kareSayisi,
  kareZamanlari,
  MAX_ETIKET,
  oneriCevabiniCoz,
  OneriOkunamadi,
  oneriIstemi,
} from "./lio-oneri";

describe("videodan kare seçimi", () => {
  test("dört saniyede bir kare, 3 ile tavan arasında", () => {
    assert.equal(kareSayisi(6), 3);
    assert.equal(kareSayisi(15), 4);
    assert.equal(kareSayisi(60), 10);
    assert.equal(kareSayisi(600), 10);
    assert.equal(kareSayisi(60, 5), 5);
  });

  test("süresi okunamayan video yine birkaç kare görür", () => {
    assert.equal(kareSayisi(NaN), 3);
    assert.equal(kareSayisi(0), 3);
  });

  test("kareler dilim ortalarından alınır, ilk ve son saniye dışarıda", () => {
    assert.deepEqual(kareZamanlari(20, 4), [2.5, 7.5, 12.5, 17.5]);
    const z = kareZamanlari(9, 3);
    assert.ok(z[0] > 0 && z[z.length - 1] < 9);
  });
});

describe("etiketler", () => {
  test("# eklenir, boşluk ve noktalama düşer, tekrar ayıklanır", () => {
    assert.deepEqual(etiketleriDuzenle(["kobi", "#KOBİ", "sosyal medya", "#üretkenlik!", "2026", ""]), [
      "#kobi",
      "#sosyalmedya",
      "#üretkenlik",
    ]);
  });

  test("metin olarak gelirse de ayrılır", () => {
    assert.deepEqual(etiketleriDuzenle("#a, #b #a"), ["#a", "#b"]);
  });

  test("Instagram'ın 30 sınırı aşılmaz", () => {
    const cok = Array.from({ length: 50 }, (_, i) => `etiket${i}`);
    assert.equal(etiketleriDuzenle(cok).length, MAX_ETIKET);
  });
});

describe("Lio yanıtı", () => {
  test("kod bloğu içindeki JSON da okunur", () => {
    const o = oneriCevabiniCoz(
      'İşte öneri:\n```json\n{"gorulen":"Bir atölye","caption":"Merhaba!","hashtags":["el yapımı","#atolye"]}\n```'
    );
    assert.equal(o.caption, "Merhaba!");
    assert.equal(o.hashtags, "#elyapımı #atolye");
    assert.equal(o.gorulen, "Bir atölye");
  });

  test("açıklama yoksa öneri yok sayılır", () => {
    assert.throws(() => oneriCevabiniCoz('{"caption":"","hashtags":[]}'), OneriOkunamadi);
    assert.throws(() => oneriCevabiniCoz("anlamsız"), OneriOkunamadi);
  });
});

describe("bağlam", () => {
  test("hesap tonu, taslak ve istek modele gider", () => {
    const metin = oneriIstemi({
      dil: "tr",
      baslik: "Ekim reels 1",
      icerikTuru: "reel",
      hesaplar: [{ platform: "instagram", handle: "projelio.app", tonNotu: "samimi" }],
      mevcutMetin: "yeni özellik",
      istek: "fiyatı vurgula",
      medyaNotu: "4 video karesi",
    });
    assert.match(metin, /@projelio\.app/);
    assert.match(metin, /samimi/);
    assert.match(metin, /yeni özellik/);
    assert.match(metin, /fiyatı vurgula/);
  });
});
