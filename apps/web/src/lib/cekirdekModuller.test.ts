import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cekirdekModulAdresi, isCekirdekModul } from "./cekirdekModuller";
import { isOpenableModule } from "./entityModules";
import { moduleSurface } from "./moduleSurfaces";

describe("çekirdek modüller", () => {
  test("iş kapsamında kendi sekmesine gider", () => {
    assert.equal(cekirdekModulAdresi("yonetim_gorev_yonetimi", { jobId: "j1" }), "/jobs/j1?tab=tasks");
    assert.equal(cekirdekModulAdresi("yonetim_program_yonetimi", { jobId: "j1" }), "/jobs/j1?tab=programs");
    assert.equal(cekirdekModulAdresi("yonetim_dosya_yonetimi", { jobId: "j1" }), "/jobs/j1?tab=files");
  });

  test("departmanda proje sekmesi olmadığı için Görevler'e gider", () => {
    assert.equal(cekirdekModulAdresi("yonetim_proje_yonetimi", { departmentId: "d1" }), "/departments/d1?tab=tasks");
    assert.equal(cekirdekModulAdresi("yonetim_dosya_yonetimi", { departmentId: "d1" }), "/departments/d1?tab=files");
  });

  test("kapsamsız ya da çekirdek olmayan modülde adres yok", () => {
    assert.equal(cekirdekModulAdresi("yonetim_gorev_yonetimi", {}), null);
    assert.equal(cekirdekModulAdresi("fm_fatura", { departmentId: "d1" }), null);
    assert.equal(isCekirdekModul("fm_fatura"), false);
  });

  // Kart tıklanamaz kalıyordu: katalogda listelenen her modülün bir yolu olmalı.
  test("Ürünler ve çekirdek modüller açılabilir, sayfa yüzeyli", () => {
    for (const key of ["uyd_urunler", "yonetim_gorev_yonetimi", "yonetim_cikti_yonetimi"]) {
      assert.equal(isOpenableModule(key, false), true, key);
      assert.equal(moduleSurface(key), "page", key);
    }
  });
});
