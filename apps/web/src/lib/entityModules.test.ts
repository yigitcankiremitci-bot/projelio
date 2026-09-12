import assert from "node:assert/strict";
import { test } from "node:test";
import { isOpenableModule } from "./entityModules";
import { moduleSurface } from "./moduleSurfaces";

test("Hesaplar kayıt tanımı olmadan departman ve iş kartından sayfa olarak açılır", () => {
  assert.equal(isOpenableModule("hesaplar", false), true);
  assert.equal(moduleSurface("hesaplar"), "page");
});

test("tanımsız modül kapalı, kayıt tanımlı modül açık kalır", () => {
  assert.equal(isOpenableModule("tanimlanmamis_modul", false), false);
  assert.equal(isOpenableModule("tanimlanmamis_modul", true), true);
});
