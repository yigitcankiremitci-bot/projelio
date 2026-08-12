// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ModuleMemberRole } from "@projelio/shared";
import { NO_ACCESS, decideAccess, type AccessFacts } from "./module-access";

// Modül sisteminin en güvenlik-kritik mantığı: kim neyi yapabilir.
// Yetki tablosu docs/moduller/05-mevcut-kod-ile-uzlasma.md içinde tanımlı;
// bu dosya o tablonun çalıştırılabilir hali.

const MODULE = "fm_gelir_gider";

function facts(over: Partial<AccessFacts> = {}): AccessFacts {
  return {
    isOwner: false,
    isDepartmentManager: false,
    isDepartmentMember: false,
    moduleMemberRoles: [],
    ...over,
  };
}

describe("decideAccess — yetki sırası", () => {
  test("1. organizasyon sahibi: tam yetki", () => {
    const a = decideAccess(MODULE, facts({ isOwner: true }));
    assert.deepEqual(
      { r: a.canRead, w: a.canWrite, t: a.canManageTeam, why: a.reason },
      { r: true, w: true, t: true, why: "owner" }
    );
  });

  test("2. departman yöneticisi: tam yetki, modüle atanmamış olsa da", () => {
    const a = decideAccess(MODULE, facts({ isDepartmentManager: true }));
    assert.deepEqual(
      { r: a.canRead, w: a.canWrite, t: a.canManageTeam, why: a.reason },
      { r: true, w: true, t: true, why: "department_manager" }
    );
  });

  test("3. modül yöneticisi: tam yetki", () => {
    const a = decideAccess(MODULE, facts({ moduleMemberRoles: ["manager"] }));
    assert.equal(a.canManageTeam, true);
    assert.equal(a.reason, "module_member");
    assert.equal(a.role, "manager");
  });

  test("4. modül üyesi (employee): yazar ama ekibi yönetemez", () => {
    const a = decideAccess(MODULE, facts({ moduleMemberRoles: ["employee"] }));
    assert.deepEqual(
      { r: a.canRead, w: a.canWrite, t: a.canManageTeam, why: a.reason, role: a.role },
      { r: true, w: true, t: false, why: "module_member", role: "employee" }
    );
  });

  test("4b. dış kaynak (subcontractor): yazar ama ekibi yönetemez", () => {
    const a = decideAccess(MODULE, facts({ moduleMemberRoles: ["subcontractor"] }));
    assert.equal(a.canWrite, true);
    assert.equal(a.canManageTeam, false);
    assert.equal(a.role, "subcontractor");
  });

  test("5. departman üyesi ama modüle atanmamış: yalnızca okuma", () => {
    const a = decideAccess(MODULE, facts({ isDepartmentMember: true }));
    assert.deepEqual(
      { r: a.canRead, w: a.canWrite, t: a.canManageTeam, why: a.reason },
      { r: true, w: false, t: false, why: "department_member" }
    );
  });

  test("6. ilgisiz kullanıcı: erişim yok", () => {
    const a = decideAccess(MODULE, facts());
    assert.deepEqual(a, NO_ACCESS(MODULE));
  });
});

describe("decideAccess — öncelik ve birleşim kuralları", () => {
  test("sahiplik departman yöneticiliğini ezer", () => {
    const a = decideAccess(MODULE, facts({ isOwner: true, isDepartmentManager: true }));
    assert.equal(a.reason, "owner");
  });

  test("departman yöneticiliği modül üyeliğini ezer", () => {
    // Yönetici aynı zamanda sıradan üye olarak atanmış olabilir; daha geniş
    // olan yetki kazanmalı, aksi halde kendi departmanının ekibini yönetemezdi.
    const a = decideAccess(MODULE, facts({ isDepartmentManager: true, moduleMemberRoles: ["employee"] }));
    assert.equal(a.reason, "department_manager");
    assert.equal(a.canManageTeam, true);
  });

  test("modül üyeliği salt-okunur departman üyeliğini ezer", () => {
    const a = decideAccess(MODULE, facts({ isDepartmentMember: true, moduleMemberRoles: ["employee"] }));
    assert.equal(a.reason, "module_member");
    assert.equal(a.canWrite, true);
  });

  test("birden fazla departmanda atanmışsa en yetkili rol kazanır", () => {
    // Aynı modül iki departmanda etkin olabilir (örn. Müşteri modülü Satış +
    // Müşteri İlişkileri); kişi birinde yönetici, diğerinde çalışan olabilir.
    const roles: ModuleMemberRole[] = ["employee", "manager"];
    const a = decideAccess(MODULE, facts({ moduleMemberRoles: roles }));
    assert.equal(a.role, "manager");
    assert.equal(a.canManageTeam, true);
  });

  test("yazma yetkisi olan herkes okuyabilir", () => {
    const senaryolar: Partial<AccessFacts>[] = [
      { isOwner: true },
      { isDepartmentManager: true },
      { moduleMemberRoles: ["manager"] },
      { moduleMemberRoles: ["employee"] },
      { moduleMemberRoles: ["subcontractor"] },
    ];
    for (const s of senaryolar) {
      const a = decideAccess(MODULE, facts(s));
      assert.equal(a.canWrite && !a.canRead, false, `okuma olmadan yazma: ${JSON.stringify(s)}`);
    }
  });

  test("ekibi yönetebilen herkes yazabilir", () => {
    const senaryolar: Partial<AccessFacts>[] = [
      { isOwner: true },
      { isDepartmentManager: true },
      { moduleMemberRoles: ["manager"] },
      { isDepartmentMember: true },
      {},
    ];
    for (const s of senaryolar) {
      const a = decideAccess(MODULE, facts(s));
      assert.equal(a.canManageTeam && !a.canWrite, false, `yazma olmadan ekip yönetimi: ${JSON.stringify(s)}`);
    }
  });

  test("moduleKey her zaman geri döner", () => {
    for (const key of ["fm_gelir_gider", "crm_musteri", "oud_depo"]) {
      assert.equal(decideAccess(key, facts()).moduleKey, key);
      assert.equal(decideAccess(key, facts({ isOwner: true })).moduleKey, key);
    }
  });
});

describe("decideAccess — serbest çalışan senaryosu", () => {
  // Serbest çalışanda departman kavramı yok: yetki ya sahiplikten ya atamadan gelir.
  test("iş sahibi tam yetkili", () => {
    const a = decideAccess(MODULE, facts({ isOwner: true }));
    assert.equal(a.canManageTeam, true);
  });

  test("işe alınmış ama modüle atanmamış kişi erişemez", () => {
    const a = decideAccess(MODULE, facts());
    assert.equal(a.canRead, false);
  });

  test("modüle atanan kişi yazabilir", () => {
    const a = decideAccess(MODULE, facts({ moduleMemberRoles: ["employee"] }));
    assert.equal(a.canWrite, true);
  });
});
