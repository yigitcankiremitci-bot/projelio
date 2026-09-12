import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hesapErisimKarari, paylasimGecerliMi } from "./hesap-erisim";

const g = (over: Partial<Parameters<typeof hesapErisimKarari>[0]> = {}) => ({
  canReadModule: true,
  isAdmin: false,
  isCreator: false,
  hasAccountGrant: false,
  hasScopeGrant: false,
  ...over,
});

test("modülü okuyamayan hiçbir sırrı göremez", () => {
  const k = hesapErisimKarari(g({ canReadModule: false, isAdmin: true, isCreator: true }));
  assert.deepEqual(k, { canReveal: false, canEdit: false });
});

test("modül üyesi olmak tek başına şifreyi göstermez", () => {
  assert.equal(hesapErisimKarari(g()).canReveal, false);
});

test("yönetici görür ve düzenler", () => {
  assert.deepEqual(hesapErisimKarari(g({ isAdmin: true })), {
    canReveal: true,
    reason: "admin",
    canEdit: true,
  });
});

test("kaydı giren kendi girdiğini görür", () => {
  assert.deepEqual(hesapErisimKarari(g({ isCreator: true })), {
    canReveal: true,
    reason: "creator",
    canEdit: true,
  });
});

test("tek hesap paylaşılan kişi görür ama düzenlemez", () => {
  assert.deepEqual(hesapErisimKarari(g({ hasAccountGrant: true })), {
    canReveal: true,
    reason: "account_grant",
    canEdit: false,
  });
});

test("tüm liste paylaşılan kişi görür ama düzenlemez", () => {
  assert.deepEqual(hesapErisimKarari(g({ hasScopeGrant: true })), {
    canReveal: true,
    reason: "scope_grant",
    canEdit: false,
  });
});

test("hesap paylaşımı kapsam paylaşımından önce gelir", () => {
  // Gerekçe denetim izine yazılıyor: ikisi birden varsa daha DAR olan yazılmalı.
  const k = hesapErisimKarari(g({ hasAccountGrant: true, hasScopeGrant: true }));
  assert.equal(k.reason, "account_grant");
});

test("geri alınmış paylaşım geçersizdir", () => {
  assert.equal(paylasimGecerliMi({ revoked_at: "2026-01-01T00:00:00Z" }), false);
});

test("süresi geçmiş paylaşım geçersizdir", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  assert.equal(paylasimGecerliMi({ expires_at: "2026-09-11T12:00:00Z" }, now), false);
  assert.equal(paylasimGecerliMi({ expires_at: "2026-09-13T12:00:00Z" }, now), true);
});

test("süresi olmayan paylaşım süresizdir", () => {
  assert.equal(paylasimGecerliMi({}), true);
});
