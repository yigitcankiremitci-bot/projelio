import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { klavyeAcikGibiMi } from "./klavye";

describe("klavyeAcikGibiMi", () => {
  it("klavye ekranın büyük kısmını kapladığında açık sayar", () => {
    assert.equal(klavyeAcikGibiMi(800, 450), true);
  });

  it("adres çubuğunun açılıp kapanmasını klavye saymaz", () => {
    assert.equal(klavyeAcikGibiMi(800, 740), false);
  });

  it("ölçü gelmemişse açık saymaz", () => {
    assert.equal(klavyeAcikGibiMi(0, 0), false);
  });
});
