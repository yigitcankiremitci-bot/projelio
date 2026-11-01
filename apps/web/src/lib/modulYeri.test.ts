import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModuleCatalogEntry } from "@projelio/shared";
import { departmaninKatalogu, modulDepartmani, yoneticiModulAdresi, yonetimeDuser } from "./modulYeri";

const modul = (over: Partial<ModuleCatalogEntry>): ModuleCatalogEntry => ({
  key: "faturalar",
  name: "Faturalar",
  scope: "organization",
  appliesToFreelancer: false,
  sortOrder: 0,
  ...over,
});

const yonetim = { id: "y", catalogKey: "yonetim" };

test("modulDepartmani: kurulu olan ilk ilgili departman kazanır", () => {
  const entry = modul({ departmentKeys: ["finans", "yonetim"] });
  assert.equal(modulDepartmani(entry, [{ id: "d2", catalogKey: "yonetim" }]), "d2");
  assert.equal(
    modulDepartmani(entry, [
      { id: "d2", catalogKey: "yonetim" },
      { id: "d1", catalogKey: "finans" },
    ]),
    "d1"
  );
});

test("modulDepartmani: departmanı yoksa Yönetim'de, Yönetim de yoksa undefined", () => {
  assert.equal(modulDepartmani(modul({ departmentKey: "finans" }), [yonetim]), "y");
  assert.equal(modulDepartmani(modul({ departmentKey: "finans" }), []), undefined);
  // Özel departmanın katalog anahtarı yok, hiçbir modülün evi olamaz.
  assert.equal(modulDepartmani(modul({ departmentKey: "finans" }), [{ id: "x", catalogKey: null }]), undefined);
});

test("yonetimeDuser: yalnızca departmanı açık olmayan şirket modülleri", () => {
  const depts = [yonetim, { id: "d1", catalogKey: "finans" }];
  assert.equal(yonetimeDuser(modul({ departmentKey: "finans" }), depts), false);
  assert.equal(yonetimeDuser(modul({ key: "crm_musteri", departmentKey: "satis" }), depts), true);
  assert.equal(yonetimeDuser(modul({ key: "h", scope: "holding" }), []), false);
  assert.equal(yonetimeDuser(modul({ key: "yonetim_gorev_yonetimi", departmentKey: "yonetim" }), []), false);
});

test("departmaninKatalogu: Yönetim kendi modülleri + departmanı açılmamışlar", () => {
  const katalog = [
    modul({ key: "yonetim_vizyon_sablonu", departmentKey: "yonetim" }),
    modul({ key: "faturalar", departmentKey: "finans" }),
    modul({ key: "crm_musteri", departmentKeys: ["satis", "musteri"] }),
  ];
  const depts = [yonetim, { id: "s", catalogKey: "satis" }];
  assert.deepEqual(
    departmaninKatalogu(katalog, "yonetim", depts).map((e) => e.key),
    ["yonetim_vizyon_sablonu", "faturalar"]
  );
  assert.deepEqual(departmaninKatalogu(katalog, "satis", depts).map((e) => e.key), ["crm_musteri"]);
  assert.deepEqual(departmaninKatalogu(katalog, undefined, depts), []);
});

test("yoneticiModulAdresi", () => {
  assert.equal(yoneticiModulAdresi("o1", "a b"), "/organizations/o1/modules/a%20b");
});
