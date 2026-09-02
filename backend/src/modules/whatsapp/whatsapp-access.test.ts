// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decideConnectionAccess } from "./whatsapp-access";

describe("WhatsApp bağlantı yetkisi", () => {
  test("sahip yönetir", () => {
    assert.deepEqual(decideConnectionAccess({ role: "owner", canView: true }), { canView: true, canManage: true });
  });

  test("departman yöneticisi ve üye yalnızca görür", () => {
    for (const role of ["department_manager", "member", "staff", "subcontractor"] as const) {
      assert.deepEqual(decideConnectionAccess({ role, canView: true }), { canView: true, canManage: false }, role);
    }
  });

  test("organizasyonu göremeyen hiçbir şey göremez", () => {
    assert.deepEqual(decideConnectionAccess({ role: "none", canView: false }), { canView: false, canManage: false });
  });
});
