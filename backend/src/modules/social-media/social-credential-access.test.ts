import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decideCredentialAccess, isGrantActive } from "./social-credential-access";

const facts = (over: Partial<Parameters<typeof decideCredentialAccess>[0]> = {}) => ({
  canReadModule: true,
  isAdmin: false,
  isCreator: false,
  hasActiveGrant: false,
  ...over,
});

test("modülü okuyamayan hiçbir şey göremez", () => {
  const d = decideCredentialAccess(facts({ canReadModule: false, isAdmin: true, isCreator: true }));
  assert.equal(d.canReveal, false);
  assert.equal(d.canEdit, false);
});

test("modül üyesi olmak tek başına şifreyi göstermez", () => {
  assert.equal(decideCredentialAccess(facts()).canReveal, false);
});

test("yönetici görür ve düzenler", () => {
  const d = decideCredentialAccess(facts({ isAdmin: true }));
  assert.deepEqual(d, { canReveal: true, reason: "admin", canEdit: true });
});

test("şifreyi giren kendi kaydını görür", () => {
  const d = decideCredentialAccess(facts({ isCreator: true }));
  assert.deepEqual(d, { canReveal: true, reason: "creator", canEdit: true });
});

test("izin verilen görür ama düzenleyemez", () => {
  const d = decideCredentialAccess(facts({ hasActiveGrant: true }));
  assert.deepEqual(d, { canReveal: true, reason: "grant", canEdit: false });
});

test("geri alınan izin geçersiz", () => {
  assert.equal(isGrantActive({ revoked_at: "2026-01-01T00:00:00Z" }), false);
});

test("süresi dolan izin geçersiz, süresizi geçerli", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  assert.equal(isGrantActive({ expires_at: "2026-05-31T23:00:00Z" }, now), false);
  assert.equal(isGrantActive({ expires_at: "2026-06-02T00:00:00Z" }, now), true);
  assert.equal(isGrantActive({}, now), true);
});
