// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { OAuthHandoffStore } from "./oauth-handoff";

describe("OAuthHandoffStore", () => {
  test("kod bir kez takas edilir", () => {
    const store = new OAuthHandoffStore();
    const code = store.create("jwt-1");

    assert.equal(store.consume(code), "jwt-1");
    // İkinci kullanım: kod URL'de dolaştığı için sızabilir; tekrar kullanılamamalı.
    assert.throws(() => store.consume(code), /geçersiz veya süresi dolmuş/);
  });

  test("bilinmeyen kod reddedilir", () => {
    const store = new OAuthHandoffStore();
    assert.throws(() => store.consume("olmayan-kod"), /geçersiz veya süresi dolmuş/);
  });

  test("süresi dolan kod kabul edilmez", () => {
    const store = new OAuthHandoffStore(-1); // her kod anında bayatlar
    const code = store.create("jwt-2");
    assert.throws(() => store.consume(code), /geçersiz veya süresi dolmuş/);
  });

  test("iki kod birbirine karışmaz", () => {
    const store = new OAuthHandoffStore();
    const a = store.create("jwt-a");
    const b = store.create("jwt-b");

    assert.notEqual(a, b);
    assert.equal(store.consume(b), "jwt-b");
    assert.equal(store.consume(a), "jwt-a");
  });
});
