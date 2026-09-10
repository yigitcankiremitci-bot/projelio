import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { BudgetTransaction } from "@projelio/shared";
import { aylikOzet, kalanGun, vadeDurumu } from "./butceOzeti";

function hareket(occurredAt: string, type: BudgetTransaction["type"], amount: number): BudgetTransaction {
  return { id: occurredAt + type + amount, type, amount, occurredAt, createdAt: occurredAt } as BudgetTransaction;
}

describe("aylık özet", () => {
  const bugun = new Date(2026, 8, 10); // 10 Eylül 2026

  it("istenen ay sayısı kadar kova üretir, eskiden yeniye", () => {
    const aylar = aylikOzet([], 6, bugun);
    assert.equal(aylar.length, 6);
    assert.equal(aylar[0].anahtar, "2026-04");
    assert.equal(aylar[5].anahtar, "2026-09");
  });

  it("yıl sınırını doğru geçer", () => {
    const aylar = aylikOzet([], 3, new Date(2026, 0, 5));
    assert.deepEqual(aylar.map((a) => a.anahtar), ["2025-11", "2025-12", "2026-01"]);
  });

  it("geliri ve gideri kendi ayına toplar; hakediş gider tarafındadır", () => {
    const aylar = aylikOzet(
      [
        hareket("2026-09-01", "income", 1000),
        hareket("2026-09-20", "income", 500),
        hareket("2026-09-03", "expense", 200),
        hareket("2026-09-04", "payout", 300),
        hareket("2026-08-15", "income", 90),
      ],
      6,
      bugun
    );
    const eylul = aylar[5];
    assert.equal(eylul.gelir, 1500);
    assert.equal(eylul.gider, 500);
    assert.equal(aylar[4].gelir, 90);
  });

  it("pencerenin dışındaki hareketi saymaz", () => {
    const aylar = aylikOzet([hareket("2025-01-01", "income", 999)], 6, bugun);
    assert.equal(aylar.reduce((t, a) => t + a.gelir, 0), 0);
  });
});

describe("vade", () => {
  const bugun = new Date(2026, 8, 10);

  it("kalan günü takvim günü olarak sayar", () => {
    assert.equal(kalanGun("2026-09-10", bugun), 0);
    assert.equal(kalanGun("2026-09-17", bugun), 7);
    assert.equal(kalanGun("2026-09-03", bugun), -7);
  });

  it("saat taşıyan tarihte de günü kaydırmaz", () => {
    assert.equal(kalanGun("2026-09-11T23:30:00.000Z", bugun), 1);
  });

  it("durumu pencereye göre ayırır", () => {
    assert.equal(vadeDurumu("2026-09-09", bugun), "gecikti");
    assert.equal(vadeDurumu("2026-09-10", bugun), "bugun");
    assert.equal(vadeDurumu("2026-09-16", bugun), "yaklasti");
    assert.equal(vadeDurumu("2026-09-30", bugun), "uzak");
  });
});
