import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buyumeEgrisi, gunleriDoldur, gunlukArtislar, haftalikYayin } from "./ilerleyis";
import type { SocialAccountMediaItem } from "./types";

const utcGun = (iso: string) => new Date(iso).toISOString().slice(0, 10);

describe("ilerleyiş", () => {
  test("günlük kazanç ardışık okumaların farkı; ilk okuma ve düşüş sayılmaz", () => {
    const g = gunlukArtislar(
      [
        { mediaId: "a", capturedAt: "2026-10-01T05:00:00Z", views: 1000 },
        { mediaId: "a", capturedAt: "2026-10-02T05:00:00Z", views: 1500 },
        { mediaId: "a", capturedAt: "2026-10-03T05:00:00Z", views: 1400 },
        { mediaId: "b", capturedAt: "2026-10-02T06:00:00Z", reach: 10 },
        { mediaId: "b", capturedAt: "2026-10-02T07:00:00Z", reach: 60 },
      ],
      utcGun
    );
    assert.deepEqual(g, [
      { gun: "2026-10-02", deger: 550 },
      { gun: "2026-10-03", deger: 0 },
    ]);
  });

  test("başlangıçtan önceki okumalar yalnızca taban olur", () => {
    const g = gunlukArtislar(
      [
        { mediaId: "a", capturedAt: "2026-09-30T05:00:00Z", views: 100 },
        { mediaId: "a", capturedAt: "2026-10-01T05:00:00Z", views: 300 },
      ],
      utcGun,
      "2026-10-01"
    );
    assert.deepEqual(g, [{ gun: "2026-10-01", deger: 200 }]);
  });

  test("boş günler yalnızca veri aralığında 0 ile dolar", () => {
    assert.deepEqual(
      gunleriDoldur([
        { gun: "2026-10-01", deger: 5 },
        { gun: "2026-10-03", deger: 7 },
      ]),
      [
        { gun: "2026-10-01", deger: 5 },
        { gun: "2026-10-02", deger: 0 },
        { gun: "2026-10-03", deger: 7 },
      ]
    );
  });

  test("haftalık yayın: gönderi sayısı ve bugünkü toplam izlenme", () => {
    const m = (id: string, postedAt: string, views: number): SocialAccountMediaItem => ({
      id,
      accountId: "h",
      externalMediaId: id,
      postedAt,
      views,
    });
    const pzt = (iso: string) => {
      const d = new Date(iso);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const h = haftalikYayin([m("a", "2026-09-29T10:00:00Z", 100), m("b", "2026-10-02T10:00:00Z", 50), m("c", "2026-10-05T10:00:00Z", 7)], pzt);
    assert.deepEqual(h, [
      { hafta: "2026-09-28", gonderi: 2, izlenme: 150 },
      { hafta: "2026-10-05", gonderi: 1, izlenme: 7 },
    ]);
  });

  test("büyüme eğrisi paylaşımdan bu yana saat, sıfırdan başlar", () => {
    const e = buyumeEgrisi("2026-10-01T10:00:00Z", [
      { capturedAt: "2026-10-01T12:00:00Z", views: 200 },
      { capturedAt: "2026-10-02T10:00:00Z", views: 900 },
    ]);
    assert.deepEqual(e, [
      { saat: 0, deger: 0 },
      { saat: 2, deger: 200 },
      { saat: 24, deger: 900 },
    ]);
  });
});
