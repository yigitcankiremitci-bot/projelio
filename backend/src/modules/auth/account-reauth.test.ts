import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assertPasskeyEnrollment, assertRecentInteractiveLogin } from "./account-reauth";

describe("kasa için yeniden kimlik doğrulama", () => {
  test("eski, eksik, gelecekteki ve devir oturumuyla ilk cihaz/şifre eklenemez", () => {
    for (const session of [{}, { loginAt: 0 }, { loginAt: 699 }, { loginAt: 1001 }, { loginAt: 1000, agent: true }]) {
      assert.throws(() => assertRecentInteractiveLogin(session, 1000));
    }
    assert.doesNotThrow(() => assertRecentInteractiveLogin({ loginAt: 700 }, 1000));
    assert.doesNotThrow(() => assertRecentInteractiveLogin({ loginAt: 1000 }, 1000));
  });
  test("şifreli hesapta yeni oturum bile şifre doğrulamasını atlayamaz", async () => {
    const session = { loginAt: Date.now() / 1000 };
    await assert.rejects(assertPasskeyEnrollment("hash", undefined, session, async () => true));
    await assert.rejects(assertPasskeyEnrollment("hash", "yanlış", session, async () => false));
    await assert.doesNotReject(assertPasskeyEnrollment("hash", "doğru", {}, async (plain, hash) => plain === "doğru" && hash === "hash"));
  });
  test("Google ile ilk cihaz yalnızca yakın tarihli gerçek girişle eklenir", async () => {
    const verify = async () => { throw new Error("Şifresiz hesapta karşılaştırma yapılmamalı"); };
    await assert.rejects(assertPasskeyEnrollment(null, undefined, {}, verify));
    await assert.rejects(assertPasskeyEnrollment(null, undefined, { loginAt: 1 }, verify));
    await assert.rejects(assertPasskeyEnrollment(null, undefined, { loginAt: Date.now() / 1000, agent: true }, verify));
    await assert.doesNotReject(assertPasskeyEnrollment(null, undefined, { loginAt: Date.now() / 1000 }, verify));
  });
});
