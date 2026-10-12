import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { anasayfaSirasiniCoz, bolumuTasi } from "./anasayfaSirasi";

describe("şirket anasayfası bölüm sırası", () => {
  test("kayıt yoksa varsayılan sıra", () => {
    assert.deepEqual(anasayfaSirasiniCoz([]), ["products", "departments", "team", "modules"]);
  });

  test("kayıtlı sıra uygulanır, eksik bölüm sona eklenir, bilinmeyen atlanır", () => {
    assert.deepEqual(anasayfaSirasiniCoz(["modules", "eski", "products"]), ["modules", "products", "departments", "team"]);
  });

  test("modüller adım adım en üste çıkar", () => {
    let sira = anasayfaSirasiniCoz([]);
    sira = bolumuTasi(sira, "modules", -1);
    sira = bolumuTasi(sira, "modules", -1);
    sira = bolumuTasi(sira, "modules", -1);
    assert.deepEqual(sira, ["modules", "products", "departments", "team"]);
  });

  test("uçtaki bölüm taşınamaz", () => {
    const sira = anasayfaSirasiniCoz([]);
    assert.deepEqual(bolumuTasi(sira, "products", -1), sira);
    assert.deepEqual(bolumuTasi(sira, "modules", 1), sira);
  });
});
