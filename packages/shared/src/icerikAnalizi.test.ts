import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  icerikTuru,
  kaydetPaylasOrani,
  medyan,
  performansDegeri,
  performanslar,
  saatOzeti,
  turOzeti,
} from "./icerikAnalizi";
import type { SocialAccountMediaItem } from "./types";

const SIMDI = new Date("2026-10-05T12:00:00Z");

function gonderi(id: string, ek: Partial<SocialAccountMediaItem> = {}): SocialAccountMediaItem {
  return {
    id,
    accountId: "h1",
    externalMediaId: `ig-${id}`,
    postedAt: "2026-09-20T18:00:00Z",
    mediaType: "VIDEO",
    mediaProductType: "REELS",
    ...ek,
  };
}

describe("içerik analizi", () => {
  test("medyan tek ve çift uzunlukta doğru, boşta null", () => {
    assert.equal(medyan([5, 1, 3]), 3);
    assert.equal(medyan([4, 1, 3, 2]), 2.5);
    assert.equal(medyan([]), null);
  });

  test("kıyas değeri önce izlenme, sonra erişim, sonra beğeni", () => {
    assert.equal(performansDegeri(gonderi("a", { views: 900, reach: 500, likeCount: 10 })), 900);
    assert.equal(performansDegeri(gonderi("b", { reach: 500, likeCount: 10 })), 500);
    assert.equal(performansDegeri(gonderi("c", { likeCount: 10 })), 10);
    assert.equal(performansDegeri(gonderi("d")), null);
  });

  test("tür Instagram'ın iki alanından çözülür", () => {
    assert.equal(icerikTuru({ mediaType: "VIDEO", mediaProductType: "REELS" }), "reels");
    assert.equal(icerikTuru({ mediaType: "CAROUSEL_ALBUM", mediaProductType: "FEED" }), "karusel");
    assert.equal(icerikTuru({ mediaType: "VIDEO", mediaProductType: "FEED" }), "video");
    assert.equal(icerikTuru({ mediaType: "IMAGE" }), "gorsel");
  });

  test("her gönderi kendi hesabının medyanıyla kıyaslanır", () => {
    const medya = [
      gonderi("a", { views: 1000 }),
      gonderi("b", { views: 1000 }),
      gonderi("c", { views: 3000 }),
      gonderi("d", { views: 500 }),
      // Başka hesap: kendi normali çok daha yüksek, ilk hesabı etkilememeli.
      gonderi("x1", { accountId: "h2", views: 100_000 }),
      gonderi("x2", { accountId: "h2", views: 100_000 }),
      gonderi("x3", { accountId: "h2", views: 50_000 }),
    ];
    const p = performanslar(medya, SIMDI);
    assert.deepEqual(p.get("c"), { kat: 3, etiket: "yildiz" });
    assert.deepEqual(p.get("d"), { kat: 0.5, etiket: "zayif" });
    assert.deepEqual(p.get("a"), { kat: 1, etiket: "normal" });
    assert.deepEqual(p.get("x3"), { kat: 0.5, etiket: "zayif" });
  });

  test("48 saatten genç gönderi 'yeni' sayılır ve normali bozmaz", () => {
    const medya = [
      gonderi("a", { views: 1000 }),
      gonderi("b", { views: 1000 }),
      gonderi("c", { views: 1000 }),
      gonderi("taze", { views: 10, postedAt: "2026-10-05T06:00:00Z" }),
    ];
    const p = performanslar(medya, SIMDI);
    assert.deepEqual(p.get("taze"), { kat: null, etiket: "yeni" });
    assert.equal(p.get("a")?.kat, 1);
  });

  test("üçten az olgun gönderide kıyas yapılmaz", () => {
    const p = performanslar([gonderi("a", { views: 10 }), gonderi("b", { views: 1000 })], SIMDI);
    assert.deepEqual(p.get("b"), { kat: null, etiket: null });
  });

  test("kaydetme+paylaşım oranı erişim yoksa hesaplanmaz", () => {
    assert.equal(kaydetPaylasOrani(gonderi("a", { reach: 1000, saved: 30, shares: 20 })), 0.05);
    assert.equal(kaydetPaylasOrani(gonderi("b", { saved: 30 })), null);
    assert.equal(kaydetPaylasOrani(gonderi("c", { reach: 1000 })), null);
  });

  test("tür özeti en iyi medyan önce", () => {
    const ozet = turOzeti(
      [
        gonderi("a", { views: 100, mediaType: "IMAGE", mediaProductType: "FEED" }),
        gonderi("b", { views: 900 }),
        gonderi("c", { views: 700 }),
      ],
      SIMDI
    );
    assert.deepEqual(ozet[0], { tur: "reels", adet: 2, medyanDeger: 800 });
    assert.equal(ozet[1].tur, "gorsel");
  });

  test("saat özeti tek gönderilik saatleri dışarıda bırakır", () => {
    const saat = (iso: string) => new Date(iso).getUTCHours();
    const ozet = saatOzeti(
      [
        gonderi("a", { views: 100, postedAt: "2026-09-01T09:00:00Z" }),
        gonderi("b", { views: 500, postedAt: "2026-09-02T18:00:00Z" }),
        gonderi("c", { views: 700, postedAt: "2026-09-03T18:30:00Z" }),
      ],
      SIMDI,
      saat
    );
    assert.deepEqual(ozet, [{ saat: 18, adet: 2, medyanDeger: 600 }]);
  });
});
