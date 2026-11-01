import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PersonalBoardItem } from "@projelio/shared";
import {
  binaYuksekligi,
  departmanDurumu,
  gunFarki,
  haftaAraligi,
  halkalariHesapla,
  hamleleriSec,
  kampusYerlesimi,
  ofisYerlesimi,
  stokDurumu,
} from "./sakin";

function kart(p: Partial<PersonalBoardItem>): PersonalBoardItem {
  return {
    itemId: p.itemId ?? Math.random().toString(36).slice(2),
    source: "assigned",
    title: "iş",
    status: "todo",
    priority: 0,
    sortOrder: 0,
    isPinned: false,
    isHidden: false,
    createdAt: "2026-10-01T09:00:00Z",
    ...p,
  };
}

describe("hamleleriSec", () => {
  test("önce gecikmiş, sonra bugün, sonra öncelik", () => {
    const items = [
      kart({ itemId: "yarin", effectiveDueDate: "2026-11-01", priority: 5 }),
      kart({ itemId: "bugun", effectiveDueDate: "2026-10-31" }),
      kart({ itemId: "eski", effectiveDueDate: "2026-10-20" }),
      kart({ itemId: "tarihsiz", priority: 3 }),
    ];
    assert.deepEqual(
      hamleleriSec(items, "2026-10-31").map((i) => i.itemId),
      ["eski", "bugun", "yarin"]
    );
  });
  test("biten ve gizli kartlar hamle olmaz", () => {
    const items = [
      kart({ itemId: "a", status: "completed", effectiveDueDate: "2026-10-01" }),
      kart({ itemId: "b", isHidden: true, effectiveDueDate: "2026-10-01" }),
      kart({ itemId: "c" }),
    ];
    assert.deepEqual(hamleleriSec(items, "2026-10-31").map((i) => i.itemId), ["c"]);
  });
});

describe("halkalariHesapla", () => {
  test("hafta, zamanında ve bugün oranları", () => {
    const hafta = haftaAraligi(new Date(2026, 9, 31)); // cumartesi
    assert.deepEqual(hafta, { bas: "2026-10-26", son: "2026-11-01" });
    const items = [
      kart({ status: "completed", completedAt: new Date(2026, 9, 31, 10).toISOString(), effectiveDueDate: "2026-10-31" }),
      kart({ status: "completed", completedAt: new Date(2026, 9, 27, 10).toISOString() }),
      kart({ effectiveDueDate: "2026-10-29" }), // gecikmiş
      kart({ effectiveDueDate: "2026-11-01" }),
      kart({ effectiveDueDate: "2026-12-01" }),
    ];
    const h = halkalariHesapla(items, "2026-10-31", hafta);
    assert.deepEqual(h.hafta, { yapilan: 2, toplam: 4, yuzde: 50 });
    assert.deepEqual(h.zamaninda, { yapilan: 2, toplam: 3, yuzde: 67 });
    assert.deepEqual(h.bugun, { yapilan: 1, toplam: 2, yuzde: 50 });
  });
  test("hiç iş yoksa halka dolu sayılır", () => {
    const h = halkalariHesapla([], "2026-10-31", haftaAraligi(new Date(2026, 9, 31)));
    assert.equal(h.hafta.yuzde, 100);
  });
});

describe("durumlar", () => {
  test("stok: depo modülüyle aynı eşik (eşit = kritik)", () => {
    assert.equal(stokDurumu(10, 10), "crit");
    assert.equal(stokDurumu(12, 10), "warn");
    assert.equal(stokDurumu(30, 10), "ok");
    assert.equal(stokDurumu(0, 0), "ok");
  });
  test("departman ışığı", () => {
    assert.equal(departmanDurumu(0, 0), "ok");
    assert.equal(departmanDurumu(1, 0), "warn");
    assert.equal(departmanDurumu(3, 0), "crit");
    assert.equal(departmanDurumu(0, 2), "crit");
  });
  test("gün farkı", () => {
    assert.equal(gunFarki("2026-10-23", "2026-10-31"), 8);
  });
});

describe("kampusYerlesimi", () => {
  test("her binaya ayrı parsel, çakışma yok", () => {
    for (const n of [1, 3, 6, 10, 14]) {
      const { parseller } = kampusYerlesimi(n);
      assert.equal(parseller.length, n);
      const anahtar = new Set(parseller.map((p) => `${p.x}:${p.y}`));
      assert.equal(anahtar.size, n);
    }
  });
  test("bina yüksekliği sınırlı", () => {
    assert.equal(binaYuksekligi(0), 1.4);
    assert.equal(binaYuksekligi(1000), 4);
  });
});

describe("ofisYerlesimi", () => {
  test("her departmana bir oda, tek sayıda ortak alan boşluğu doldurur", () => {
    for (const n of [1, 2, 3, 5, 6, 7, 10, 14]) {
      const { odalar } = ofisYerlesimi(n);
      assert.equal(odalar.filter((o) => !o.ortak).length, n);
      assert.ok(odalar.filter((o) => o.ortak).length <= 1);
    }
  });
  test("odalar çakışmaz", () => {
    const { odalar } = ofisYerlesimi(10);
    for (const a of odalar)
      for (const b of odalar) {
        if (a === b) continue;
        const ust = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
        assert.equal(ust, false);
      }
  });
});
