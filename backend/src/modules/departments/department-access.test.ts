// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NO_DEPARTMENT_ACCESS, decideDepartmentAccess, type DepartmentAccessFacts } from "./department-access";

// Kullanıcı görünüm hiyerarşisinin en kritik kuralı: bir departman, kadrosunda
// olmayan hiç kimseye görünmez; taşeron kendi departmanını görür ama bütçeyi ve
// kadro listesini görmez. Bu dosya o kuralın çalıştırılabilir hali.

function facts(over: Partial<DepartmentAccessFacts> = {}): DepartmentAccessFacts {
  return { isOrgOwner: false, isOrgMember: false, ...over };
}

const shape = (a: ReturnType<typeof decideDepartmentAccess>) => ({
  role: a.role,
  view: a.canView,
  team: a.canViewTeam,
  budget: a.canViewBudget,
  manage: a.canManage,
});

describe("decideDepartmentAccess — yetki sırası", () => {
  test("1. organizasyon sahibi: tam yetki", () => {
    assert.deepEqual(shape(decideDepartmentAccess(facts({ isOrgOwner: true }))), {
      role: "owner",
      view: true,
      team: true,
      budget: true,
      manage: true,
    });
  });

  test("2. departman yöneticisi: bütçe dahil tam yetki", () => {
    assert.deepEqual(shape(decideDepartmentAccess(facts({ membershipRole: "manager" }))), {
      role: "manager",
      view: true,
      team: true,
      budget: true,
      manage: true,
    });
  });

  test("3. organizasyon üyesi: görür ve kadroyu okur, bütçeyi görmez", () => {
    assert.deepEqual(shape(decideDepartmentAccess(facts({ isOrgMember: true }))), {
      role: "org_member",
      view: true,
      team: true,
      budget: false,
      manage: false,
    });
  });

  test("4. çalışan: görür ve kadroyu okur, bütçeyi görmez", () => {
    assert.deepEqual(shape(decideDepartmentAccess(facts({ membershipRole: "employee" }))), {
      role: "employee",
      view: true,
      team: true,
      budget: false,
      manage: false,
    });
  });

  test("5. taşeron: yalnızca departmanı görür — kadro ve bütçe kapalı", () => {
    assert.deepEqual(shape(decideDepartmentAccess(facts({ membershipRole: "subcontractor" }))), {
      role: "subcontractor",
      view: true,
      team: false,
      budget: false,
      manage: false,
    });
  });

  test("6. ilgisiz kullanıcı: departman hiç görünmez", () => {
    assert.deepEqual(decideDepartmentAccess(facts()), NO_DEPARTMENT_ACCESS);
  });
});

describe("decideDepartmentAccess — sıra çakışmaları", () => {
  test("yöneticilik organizasyon üyeliğini bastırır (dar rol geniş rolü ezmez)", () => {
    const a = decideDepartmentAccess(facts({ isOrgMember: true, membershipRole: "manager" }));
    assert.equal(a.role, "manager");
    assert.equal(a.canViewBudget, true);
  });

  test("organizasyon üyeliği taşeronluğu bastırır: kadroyu okuyabilir", () => {
    // Aynı kişi hem organizasyonun onaylı üyesi hem bir departmanda taşeron
    // olabilir; geniş olan kazanır. Bütçe yine kapalı.
    const a = decideDepartmentAccess(facts({ isOrgMember: true, membershipRole: "subcontractor" }));
    assert.equal(a.role, "org_member");
    assert.equal(a.canViewTeam, true);
    assert.equal(a.canViewBudget, false);
  });

  test("sahiplik her şeyi bastırır", () => {
    const a = decideDepartmentAccess(facts({ isOrgOwner: true, membershipRole: "subcontractor" }));
    assert.equal(a.role, "owner");
  });
});

describe("taşeron sızıntı senaryosu", () => {
  // Şikayetin tam hali: bir departmana taşeron olarak eklenen kullanıcı,
  // organizasyonun DİĞER departmanlarını da görebiliyordu.
  test("taşeron, kadrosunda olmadığı departmanı göremez", () => {
    const kendiDepartmani = decideDepartmentAccess(facts({ membershipRole: "subcontractor" }));
    const digerDepartman = decideDepartmentAccess(facts()); // o departmanda kaydı yok

    assert.equal(kendiDepartmani.canView, true);
    assert.equal(digerDepartman.canView, false);
  });

  test("taşeron hiçbir departmanda bütçe göremez", () => {
    for (const f of [facts({ membershipRole: "subcontractor" }), facts()]) {
      assert.equal(decideDepartmentAccess(f).canViewBudget, false);
    }
  });
});
