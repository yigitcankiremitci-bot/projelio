import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModuleCatalogEntry } from "@projelio/shared";
import { modulDepartmani, yoneticiModulAdresi, yoneticiyeEklenebilir } from "./modulYeri";

const modul = (over: Partial<ModuleCatalogEntry>): ModuleCatalogEntry => ({
  key: "faturalar",
  name: "Faturalar",
  scope: "organization",
  appliesToFreelancer: false,
  sortOrder: 0,
  ...over,
});

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

test("modulDepartmani: departman yoksa yöneticide (undefined)", () => {
  assert.equal(modulDepartmani(modul({ departmentKey: "finans" }), []), undefined);
  // Özel departmanın katalog anahtarı yok, hiçbir modülün evi olamaz.
  assert.equal(modulDepartmani(modul({ departmentKey: "finans" }), [{ id: "x", catalogKey: null }]), undefined);
});

test("yoneticiyeEklenebilir: yalnızca departmanı açık olmayan şirket modülleri", () => {
  const depts = [{ id: "d1", catalogKey: "finans" }];
  assert.equal(yoneticiyeEklenebilir(modul({ departmentKey: "finans" }), depts), false);
  assert.equal(yoneticiyeEklenebilir(modul({ key: "crm_musteri", departmentKey: "satis" }), depts), true);
  assert.equal(yoneticiyeEklenebilir(modul({ key: "h", scope: "holding" }), []), false);
  assert.equal(yoneticiyeEklenebilir(modul({ key: "yonetim_gorev_yonetimi", departmentKey: "yonetim" }), []), false);
});

test("yoneticiModulAdresi", () => {
  assert.equal(yoneticiModulAdresi("o1", "a b"), "/organizations/o1/modules/a%20b");
});
