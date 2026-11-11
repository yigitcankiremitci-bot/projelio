import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { notSorumlusu, sorumluAdi } from "./partySorumlu";

const NOT = "Firma kodu: ECZ0002 · Sınıf: ECZANE · Tür: ALICI · Sorumlu: MEHMET KİREMİTCİ · Kayıt tarihi: 22.12.2025";

describe("kartın sorumlusu", () => {
  it("nottaki sorumluyu okur ve büyük harfi okunur yapar", () => {
    assert.equal(notSorumlusu(NOT), "Mehmet Kiremitci");
  });

  it("karışık harfli adı olduğu gibi bırakır", () => {
    assert.equal(notSorumlusu("Sorumlu: Ayşe Yılmaz"), "Ayşe Yılmaz");
  });

  it("notta sorumlu yoksa boş döner", () => {
    assert.equal(notSorumlusu("Firma kodu: X"), undefined);
    assert.equal(notSorumlusu(undefined), undefined);
  });

  it("sorumlu ekleyenin kendisiyse nottaki ad gösterilir", () => {
    assert.equal(sorumluAdi({ ownerUserId: "can", createdBy: "can", ownerName: "Can Kiremitci", notes: NOT }), "Mehmet Kiremitci");
  });

  it("kart başka birine atandıysa sistemdeki sorumlu geçerlidir", () => {
    assert.equal(sorumluAdi({ ownerUserId: "onur", createdBy: "can", ownerName: "Onur Erdem", notes: NOT }), "Onur Erdem");
  });

  it("notta sorumlu yoksa sistemdeki sorumluya düşer", () => {
    assert.equal(sorumluAdi({ ownerUserId: "can", createdBy: "can", ownerName: "Can Kiremitci", notes: "Firma kodu: X" }), "Can Kiremitci");
  });

  it("sistemdeki karışık yazımlı ad da okunur yapılır", () => {
    assert.equal(sorumluAdi({ ownerUserId: "m", createdBy: "m", ownerName: "Mehmet KİREMİTCİ", notes: "" }), "Mehmet Kiremitci");
  });
});
