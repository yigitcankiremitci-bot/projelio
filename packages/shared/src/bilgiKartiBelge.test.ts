import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BELGE_UYARI_GUNU, belgeDurumu } from "./bilgiKartiBelge";

describe("belgeDurumu", () => {
  const bugun = new Date("2026-09-12T10:00:00Z");

  test("tarihi olmayan belge her zaman geçerli", () => {
    assert.equal(belgeDurumu(undefined, bugun), "gecerli");
  });

  test("uzak tarih geçerli", () => {
    assert.equal(belgeDurumu("2027-01-01", bugun), "gecerli");
  });

  test("eşiğin içindeki tarih uyarı verir", () => {
    assert.equal(belgeDurumu("2026-10-01", bugun), "yaklasiyor");
  });

  test("eşiğin tam sınırı da uyarıdır", () => {
    const sinir = new Date(bugun.getTime() + BELGE_UYARI_GUNU * 86400000);
    assert.equal(belgeDurumu(sinir.toISOString().slice(0, 10), bugun), "yaklasiyor");
  });

  test("geçmiş tarih dolmuş sayılır", () => {
    assert.equal(belgeDurumu("2026-09-01", bugun), "doldu");
  });

  // Bozuk tarih "doldu" gösterseydi, kullanıcı hiç girmediği bir son kullanma
  // tarihi yüzünden geçerli belgesini yenilemeye kalkardı.
  test("okunamayan tarih uyarı üretmez", () => {
    assert.equal(belgeDurumu("çok yakında", bugun), "gecerli");
  });
});
