import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { focusParams, resolveTaskFocus } from "./taskFocus";

describe("görev odağı", () => {
  it("adres parçasını üretir", () => {
    assert.equal(focusParams("t1", "board"), "focus=t1&focusIn=board");
    assert.equal(focusParams("a/b", "today"), "focus=a%2Fb&focusIn=today");
  });

  // Asıl mesele: aynı görev iki listede birden olsa bile çıkılan kopya dönmeli.
  it("belirtilen kaynağa sadık kalır — görev bugün listesinde OLSA bile", () => {
    assert.deepEqual(resolveTaskFocus("t1", "board", true), { id: "t1", where: "board" });
    assert.deepEqual(resolveTaskFocus("t1", "today", false), { id: "t1", where: "today" });
  });

  it("kaynak yoksa bugün listesinde olup olmadığına bakar", () => {
    assert.deepEqual(resolveTaskFocus("t1", null, true), { id: "t1", where: "today" });
    assert.deepEqual(resolveTaskFocus("t1", null, false), { id: "t1", where: "board" });
  });

  it("bozuk kaynağı yok sayar", () => {
    assert.deepEqual(resolveTaskFocus("t1", "sidebar", true), { id: "t1", where: "today" });
    assert.deepEqual(resolveTaskFocus("t1", "", false), { id: "t1", where: "board" });
  });

  it("kimlik yoksa hedef yok", () => {
    assert.equal(resolveTaskFocus(null, "board", true), null);
  });
});
