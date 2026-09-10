import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { advanceDueDate, islenecekDonemler } from "./vade";

describe("vade ilerletme", () => {
  it("haftalık 7 gün ekler", () => {
    assert.equal(advanceDueDate("2026-09-28", "weekly"), "2026-10-05");
  });

  it("ay sonu taşmaz: 31 Ocak + 1 ay = 28 Şubat", () => {
    assert.equal(advanceDueDate("2026-01-31", "monthly"), "2026-02-28");
  });

  it("çapa gün korunur: Şubat'a çekilen ödeme Mart'ta 31'e döner", () => {
    assert.equal(advanceDueDate("2026-02-28", "monthly", 31), "2026-03-31");
  });

  it("yıllık aynı güne gider", () => {
    assert.equal(advanceDueDate("2026-03-10", "yearly"), "2027-03-10");
  });
});

describe("işlenecek dönemler", () => {
  it("vadesi bugün olan tek dönem üretir", () => {
    const { tarihler, sonrakiVade } = islenecekDonemler("2026-09-10", "monthly", 10, "2026-09-10");
    assert.deepEqual(tarihler, ["2026-09-10"]);
    assert.equal(sonrakiVade, "2026-10-10");
  });

  it("kaçırılan her dönem için ayrı kayıt üretir", () => {
    const { tarihler, sonrakiVade } = islenecekDonemler("2026-06-05", "monthly", 5, "2026-09-10");
    assert.deepEqual(tarihler, ["2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05"]);
    assert.equal(sonrakiVade, "2026-10-05");
  });

  it("vadesi gelmemişse tek kayıt, tarihi BUGÜN; vade kendi takviminden ilerler", () => {
    // Erken ödeme: para bugün çıktı ama ödeme günü öne kaymamalı.
    const { tarihler, sonrakiVade } = islenecekDonemler("2026-09-20", "monthly", 20, "2026-09-10");
    assert.deepEqual(tarihler, ["2026-09-10"]);
    assert.equal(sonrakiVade, "2026-10-20");
  });

  it("çok eski bir vade sonsuz döngüye girmez", () => {
    const { tarihler } = islenecekDonemler("2000-01-01", "monthly", 1, "2026-09-10");
    assert.equal(tarihler.length, 60);
  });
});
