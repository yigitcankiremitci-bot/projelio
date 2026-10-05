// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SocialAccountMediaItem } from "@projelio/shared";
import {
  AnalizOkunamadi,
  fikirRaporuIstemi,
  fikirRaporunuCoz,
  gonderiAnaliziniCoz,
  ilhamAnaliziniCoz,
  insightsYanitiniOku,
  medyaSayfasiniOku,
  metaHataTuru,
  metaZamani,
  metrikListeleri,
} from "./icerik-analizi";

describe("Instagram metrikleri", () => {
  test("reels izlenme süresini de ister, son liste en temel", () => {
    const listeler = metrikListeleri("REELS");
    assert.ok(listeler[0].includes("ig_reels_avg_watch_time"));
    assert.deepEqual(listeler[listeler.length - 1], ["reach", "saved", "shares"]);
    assert.ok(!metrikListeleri("FEED")[0].includes("ig_reels_avg_watch_time"));
  });

  test("iki yanıt biçimi de okunur, bilinmeyen metrik ve sayı olmayan değer düşer", () => {
    const m = insightsYanitiniOku({
      data: [
        { name: "reach", values: [{ value: 1200 }] },
        { name: "views", total_value: { value: 3400 } },
        { name: "ig_reels_avg_watch_time", values: [{ value: 7350.4 }] },
        { name: "saved", values: [{ value: "bozuk" }] },
        { name: "bilinmeyen", values: [{ value: 5 }] },
      ],
    });
    assert.deepEqual(m, { reach: 1200, views: 3400, avgWatchTimeMs: 7350 });
    assert.deepEqual(insightsYanitiniOku(null), {});
  });

  test("medya sayfası okunur; görselin kapağı kendisidir, sonraki sayfa adresi taşınır", () => {
    const { medya, sonraki } = medyaSayfasiniOku({
      data: [
        { id: "1", media_type: "IMAGE", media_url: "https://cdn/g.jpg", timestamp: "2026-09-20T18:00:00+0000", like_count: 5 },
        { id: "2", media_type: "VIDEO", media_product_type: "REELS", media_url: "https://cdn/v.mp4", thumbnail_url: "https://cdn/k.jpg" },
        { media_type: "IMAGE" },
      ],
      paging: { next: "https://graph.instagram.com/v21.0/me/media?after=x" },
    });
    assert.equal(medya.length, 2);
    assert.equal(medya[0].thumbnailUrl, "https://cdn/g.jpg");
    assert.equal(medya[0].timestamp, "2026-09-20T18:00:00.000Z");
    assert.equal(medya[1].thumbnailUrl, "https://cdn/k.jpg");
    assert.ok(sonraki?.includes("after=x"));
  });

  test("Meta zamanı iki noktasız ofsetle de okunur", () => {
    assert.equal(metaZamani("2026-09-20T21:00:00+0300"), "2026-09-20T18:00:00.000Z");
    assert.equal(metaZamani("bozuk"), null);
    assert.equal(metaZamani(undefined), null);
  });

  test("hata kodundan hesap düzeyi karar", () => {
    assert.equal(metaHataTuru('{"error":{"code":10}}'), "izin");
    assert.equal(metaHataTuru('{"error":{"code":190}}'), "jeton");
    assert.equal(metaHataTuru('{"error":{"code":100}}'), "diger");
    assert.equal(metaHataTuru("<html>"), "diger");
  });
});

describe("Lio yanıtları", () => {
  test("gönderi analizi kod bloğu içinden de okunur, listeler kırpılır", () => {
    const a = gonderiAnaliziniCoz(
      'Analiz:\n```json\n{"hook":"Soruyla açılıyor","nedenler":["a","b","",3],"tekrarla":["x"],"gelistir":[]}\n```'
    );
    assert.equal(a.hook, "Soruyla açılıyor");
    assert.deepEqual(a.nedenler, ["a", "b"]);
    assert.deepEqual(a.gelistir, []);
  });

  test("boş analiz reddedilir", () => {
    assert.throws(() => gonderiAnaliziniCoz('{"hook":"","nedenler":[]}'), AnalizOkunamadi);
    assert.throws(() => ilhamAnaliziniCoz("anlamsız"), AnalizOkunamadi);
  });

  test("fikir raporu: başlıksız fikir düşer, hiç fikir yoksa ret", () => {
    const r = fikirRaporunuCoz(
      '{"ozet":"Özet","kaliplar":[{"baslik":"Soru hook","aciklama":"..."}],"fikirler":[{"baslik":"F1","hook":"H","format":"Reels","neden":"N"},{"hook":"başlıksız"}]}'
    );
    assert.equal(r.fikirler.length, 1);
    assert.equal(r.kaliplar[0].baslik, "Soru hook");
    assert.throws(() => fikirRaporunuCoz('{"ozet":"x","fikirler":[]}'), AnalizOkunamadi);
  });

  test("rapor istemi en iyi gönderileri katıyla ve ilhamları içerir", () => {
    const g = (id: string, views: number): SocialAccountMediaItem => ({
      id,
      accountId: "h1",
      externalMediaId: id,
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      postedAt: "2026-09-01T10:00:00Z",
      views,
      caption: `Açıklama ${id}`,
    });
    const istem = fikirRaporuIstemi({
      dil: "tr",
      hesaplar: [{ accountId: "h1", handle: "pist", tonNotu: "samimi" }],
      medya: [g("a", 1000), g("b", 1000), g("c", 4000)],
      ilhamlar: [{ id: "i1", kind: "post", platform: "instagram", title: "Soru ile açılan reels", note: "ilk 2 sn", createdAt: "" }],
      istek: "eğitici içerik",
      simdi: new Date("2026-10-05T00:00:00Z"),
    });
    assert.match(istem, /4x · reels/);
    assert.match(istem, /Açıklama c/);
    assert.match(istem, /Soru ile açılan reels/);
    assert.match(istem, /Kullanıcının isteği: eğitici içerik/);
    assert.match(istem, /Ton notu: samimi/);
  });
});
