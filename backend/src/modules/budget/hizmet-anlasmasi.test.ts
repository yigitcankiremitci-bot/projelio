import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { BudgetTransaction } from "@projelio/shared";
import { aynaKayit, hizmetOzeti, hizmetYetkisi, uyeKendiOdemesiniYonetebilir } from "./hizmet-anlasmasi";

function tx(over: Partial<BudgetTransaction>): BudgetTransaction {
  return {
    id: "t1",
    type: "payout",
    amount: 0,
    currency: "TRY",
    occurredAt: "2026-09-13",
    createdAt: "2026-09-13T00:00:00Z",
    ...over,
  };
}

describe("hizmetOzeti", () => {
  test("30.000 anlaşma, 10.000 ödeme → 20.000 kalan", () => {
    assert.deepEqual(hizmetOzeti(30000, [tx({ amount: 10000 })]), {
      agreedFee: 30000,
      paid: 10000,
      remaining: 20000,
      overpaid: 0,
    });
  });

  test("ödenen anlaşmanın üstüne eklenmez; fazlası ayrı görünür", () => {
    const o = hizmetOzeti(30000, [tx({ amount: 20000 }), tx({ amount: 15000 })]);
    assert.equal(o.remaining, 0);
    assert.equal(o.overpaid, 5000);
  });

  test("döviz ödeme ₺ anlaşmadan düşülmez (kur dönüşümü yok)", () => {
    assert.equal(hizmetOzeti(30000, [tx({ amount: 1000, currency: "USD" })]).paid, 0);
  });

  test("anlaşma yoksa fazla ödeme sayılmaz", () => {
    assert.equal(hizmetOzeti(null, [tx({ amount: 5000 })]).overpaid, 0);
  });
});

describe("hizmetYetkisi", () => {
  test("sahip ve üyenin kendisi girebilir", () => {
    assert.equal(hizmetYetkisi({ isManager: true, isSelf: false }).canEdit, true);
    assert.equal(hizmetYetkisi({ isManager: false, isSelf: true }).canEdit, true);
  });

  test("başka bir üye başkasının anlaşmasını göremez", () => {
    assert.deepEqual(hizmetYetkisi({ isManager: false, isSelf: false }), { canView: false, canEdit: false });
  });
});

describe("aynaKayit", () => {
  test("sahibin gideri üyede salt okunur gelir olur", () => {
    const a = aynaKayit(tx({ amount: 10000 }), "Arda İrman");
    assert.equal(a.type, "income");
    assert.equal(a.readOnly, true);
    assert.equal(a.mirror, true);
    assert.equal(a.counterpartyName, "Arda İrman");
    assert.equal(a.amount, 10000);
  });
});

describe("uyeKendiOdemesiniYonetebilir", () => {
  const satir = { type: "payout", user_id: "can", created_by: "can", source: "manual" };

  test("kendi girdiği, kendine yapılan ödeme", () => {
    assert.equal(uyeKendiOdemesiniYonetebilir(satir, "can"), true);
  });

  test("sahibin girdiği satır üyenin değil", () => {
    assert.equal(uyeKendiOdemesiniYonetebilir({ ...satir, created_by: "arda" }, "can"), false);
  });

  test("başkasına yapılan ödeme", () => {
    assert.equal(uyeKendiOdemesiniYonetebilir({ ...satir, user_id: "baska" }, "can"), false);
  });

  test("gider ya da otomatik satır", () => {
    assert.equal(uyeKendiOdemesiniYonetebilir({ ...satir, type: "expense" }, "can"), false);
    assert.equal(uyeKendiOdemesiniYonetebilir({ ...satir, source: "task_budget" }, "can"), false);
  });
});
