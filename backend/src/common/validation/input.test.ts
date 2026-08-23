// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MAX_MONEY_AMOUNT, optionalOneOf, requireAmount, requireOneOf, requireUuid } from "./input";

// Asıl derdimiz negatif tutar: işlemin yönü `type` alanında olduğu için negatif
// bir "expense" toplam gideri düşürüp kârı olduğundan yüksek gösteriyordu.

describe("requireAmount", () => {
  test("negatif tutar reddedilir", () => {
    assert.throws(() => requireAmount(-1), /negatif olamaz/);
  });

  test("sayıya çevrilemeyen değerler reddedilir", () => {
    for (const bad of ["abc", NaN, Infinity, null, undefined, {}, [], true]) {
      assert.throws(() => requireAmount(bad), /geçerli bir sayı olmalı/, `kabul edilmemeliydi: ${String(bad)}`);
    }
  });

  test("sütun taşmasına yol açacak tutar reddedilir", () => {
    assert.throws(() => requireAmount(MAX_MONEY_AMOUNT + 1), /çok büyük/);
  });

  test("geçerli tutarlar geçer; sayısal metin sayıya çevrilir", () => {
    assert.equal(requireAmount(0), 0);
    assert.equal(requireAmount(1500.5), 1500.5);
    assert.equal(requireAmount("1500"), 1500);
  });
});

describe("requireOneOf", () => {
  const roles = ["manager", "employee", "subcontractor"] as const;

  test("listede olmayan rol reddedilir", () => {
    for (const bad of ["owner", "MANAGER", "", 1, null, undefined]) {
      assert.throws(() => requireOneOf(bad, roles, "Rol"), /şunlardan biri olmalı/);
    }
  });

  test("listedeki rol aynen döner", () => {
    assert.equal(requireOneOf("manager", roles, "Rol"), "manager");
  });

  test("optionalOneOf yalnızca alan gönderilmemişse sessiz kalır", () => {
    assert.equal(optionalOneOf(undefined, roles, "Rol"), undefined);
    assert.throws(() => optionalOneOf("hacker", roles, "Rol"), /şunlardan biri olmalı/);
  });
});

// requireUuid, filtre METNİNE gömülen kimlikler için. Oradaki bir virgül
// PostgREST'te yeni bir koşul açar; asıl engellenmesi gereken bu.
describe("requireUuid", () => {
  const gecerli = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

  test("geçerli UUID aynen döner", () => {
    assert.equal(requireUuid(gecerli, "Departman kimliği"), gecerli);
    assert.equal(requireUuid(gecerli.toUpperCase(), "Departman kimliği"), gecerli.toUpperCase());
  });

  test("filtre sözdizimi taşıyan değer reddedilir", () => {
    for (const bad of [
      `${gecerli},department_id.is.null`,
      `${gecerli},password_hash.like.*`,
      `${gecerli})`,
      "*",
    ]) {
      assert.throws(() => requireUuid(bad, "Departman kimliği"), /geçerli bir kimlik değil/, `kabul edilmemeliydi: ${bad}`);
    }
  });

  test("UUID olmayan tipler reddedilir", () => {
    for (const bad of ["", "abc", 123, null, undefined, {}]) {
      assert.throws(() => requireUuid(bad, "Departman kimliği"), /geçerli bir kimlik değil/);
    }
  });
});
