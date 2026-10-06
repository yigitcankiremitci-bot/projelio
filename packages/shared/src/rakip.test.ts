import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { etkilesim, rakipKatlari, rakipOzeti } from "./rakip";

const SIMDI = new Date("2026-10-06T12:00:00Z");
const g = (id: string, postedAt: string, like: number, yorum = 0) => ({
  externalMediaId: id,
  postedAt,
  likeCount: like,
  commentsCount: yorum,
});

describe("rakip istatistikleri", () => {
  test("etkileşim beğeni + yorum; ikisi de yoksa null", () => {
    assert.equal(etkilesim({ likeCount: 10, commentsCount: 2 }), 12);
    assert.equal(etkilesim({}), null);
  });

  test("özet: haftalık gönderi, medyan etkileşim, oran ve takipçi değişimi", () => {
    const gonderiler = [
      g("a", "2026-10-05T10:00:00Z", 9999), // taze: kıyas dışı
      g("b", "2026-10-01T10:00:00Z", 100),
      g("c", "2026-09-25T10:00:00Z", 200),
      g("d", "2026-09-15T10:00:00Z", 300),
      g("e", "2026-08-01T10:00:00Z", 50),
    ];
    const o = rakipOzeti(
      gonderiler,
      [
        { gun: "2026-09-06", deger: 900 },
        { gun: "2026-09-29", deger: 980 },
        { gun: "2026-10-06", deger: 1000 },
      ],
      1000,
      SIMDI
    );
    assert.equal(o.haftalikGonderi, 1); // 28 günde 4 gönderi
    assert.equal(o.medyanEtkilesim, 150);
    assert.equal(o.etkilesimOrani, 15);
    assert.equal(o.takipciDegisim7, 20);
    assert.equal(o.takipciDegisim30, 100);
  });

  test("katlar hesabın kendi medyanına göre; taze gönderi null", () => {
    const k = rakipKatlari(
      [g("a", "2026-10-06T08:00:00Z", 500), g("b", "2026-09-01T00:00:00Z", 100), g("c", "2026-09-02T00:00:00Z", 300)],
      SIMDI
    );
    assert.equal(k.get("a"), null);
    assert.equal(k.get("b"), 0.5);
    assert.equal(k.get("c"), 1.5);
  });
});
