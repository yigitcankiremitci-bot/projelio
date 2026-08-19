// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canRespond, needsApproval, resolveApprovers, type CreationScopeFacts } from "./creation-approval";

// Onay akışının iki kritik kararı: "izin gerekiyor mu" ve "kime soruluyor".
// İkisi de saf fonksiyon olduğu için veritabanı olmadan burada sabitlenir.

function facts(over: Partial<CreationScopeFacts> = {}): CreationScopeFacts {
  return { isSubcontractor: false, ...over };
}

describe("needsApproval — kim izin ister", () => {
  test("taşeron olmayan hiçbir durumda izin istemez", () => {
    assert.equal(needsApproval("job", facts({ hasOrganization: true })), false);
    assert.equal(needsApproval("project", facts({ isJobOwner: false })), false);
  });

  test("taşeron: başkasının işine proje açmak izin ister", () => {
    assert.equal(needsApproval("project", facts({ isSubcontractor: true, isJobOwner: false })), true);
  });

  test("taşeron: KENDİ işine proje açmak izin istemez", () => {
    assert.equal(needsApproval("project", facts({ isSubcontractor: true, isJobOwner: true })), false);
  });

  test("taşeron: organizasyona bağlı iş açmak izin ister", () => {
    assert.equal(
      needsApproval("job", facts({ isSubcontractor: true, hasOrganization: true, isOrganizationOwner: false })),
      true
    );
  });

  test("taşeron: kişisel (organizasyonsuz) iş açmak izin istemez", () => {
    // Kendi defteri — kimseyi ilgilendirmez.
    assert.equal(needsApproval("job", facts({ isSubcontractor: true, hasOrganization: false })), false);
  });

  test("taşeron kendi organizasyonunun sahibiyse izin istemez", () => {
    assert.equal(
      needsApproval("job", facts({ isSubcontractor: true, hasOrganization: true, isOrganizationOwner: true })),
      false
    );
  });
});

describe("resolveApprovers — kime sorulur", () => {
  const REQUESTER = "u-taseron";

  test("proje talebi işin sahibine gider", () => {
    assert.deepEqual(resolveApprovers("project", REQUESTER, { jobOwnerId: "u-patron" }), ["u-patron"]);
  });

  test("iş talebi organizasyon sahibine + departman yöneticilerine gider", () => {
    const approvers = resolveApprovers("job", REQUESTER, {
      organizationOwnerId: "u-patron",
      departmentManagerIds: ["u-mudur1", "u-mudur2"],
    });
    assert.deepEqual(approvers.sort(), ["u-mudur1", "u-mudur2", "u-patron"]);
  });

  test("aynı kişi iki rolde de olsa bir kez listelenir", () => {
    const approvers = resolveApprovers("job", REQUESTER, {
      organizationOwnerId: "u-patron",
      departmentManagerIds: ["u-patron"],
    });
    assert.deepEqual(approvers, ["u-patron"]);
  });

  test("kimse kendi talebini onaylayamaz", () => {
    const approvers = resolveApprovers("job", REQUESTER, {
      organizationOwnerId: REQUESTER,
      departmentManagerIds: [REQUESTER, "u-mudur"],
    });
    assert.deepEqual(approvers, ["u-mudur"]);
  });

  test("onaylayacak kimse yoksa boş liste döner (talep askıda kalır, kimse yetkisiz karar veremez)", () => {
    assert.deepEqual(resolveApprovers("project", REQUESTER, { jobOwnerId: null }), []);
    assert.deepEqual(resolveApprovers("job", REQUESTER, {}), []);
  });

  test("proje talebinde departman yöneticileri devreye girmez", () => {
    const approvers = resolveApprovers("project", REQUESTER, {
      jobOwnerId: "u-patron",
      departmentManagerIds: ["u-mudur"],
    });
    assert.deepEqual(approvers, ["u-patron"]);
  });
});

describe("canRespond — çift karar koruması", () => {
  test("yalnızca bekleyen talep yanıtlanır", () => {
    assert.equal(canRespond("pending"), true);
    for (const s of ["approved", "rejected", "cancelled"] as const) {
      assert.equal(canRespond(s), false);
    }
  });
});
