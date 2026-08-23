// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as bcrypt from "bcrypt";
import {
  BCRYPT_ROUNDS,
  MAX_PASSWORD_BYTES,
  hashPassword,
  needsRehash,
  verifyPassword,
  wasteVerifyTime,
} from "./password.util";

// bcrypt yavaş olduğu için test sayısı bilinçli olarak az tutuldu; her hash
// çağrısı ~250 ms sürüyor.

describe("hashPassword / verifyPassword", () => {
  test("hash güncel maliyetle üretilir ve doğrulanır", async () => {
    const hash = await hashPassword("dogru-sifre-123");
    assert.equal(bcrypt.getRounds(hash), BCRYPT_ROUNDS);
    assert.equal(await verifyPassword("dogru-sifre-123", hash), true);
    assert.equal(await verifyPassword("yanlis-sifre-123", hash), false);
  });

  test("72 baytı aşan şifre sessizce kesilmez, reddedilir", async () => {
    // 40 Türkçe karakter = 80 bayt: karakter sayısı sınırın altında ama bayt değil.
    const uzun = "şğüıöç".repeat(10);
    assert.ok(uzun.length < MAX_PASSWORD_BYTES, "karakter sayısı sınırın altında olmalı");
    assert.ok(Buffer.byteLength(uzun, "utf8") > MAX_PASSWORD_BYTES, "bayt sayısı sınırı aşmalı");
    await assert.rejects(() => hashPassword(uzun), /Şifre çok uzun/);
  });
});

describe("needsRehash", () => {
  test("daha düşük maliyetli eski hash tazelenmeli", async () => {
    const eski = await bcrypt.hash("sifre", BCRYPT_ROUNDS - 2);
    assert.equal(needsRehash(eski), true);
  });

  test("güncel maliyetli hash olduğu gibi kalır", async () => {
    assert.equal(needsRehash(await hashPassword("sifre")), false);
  });

  test("tanınmayan biçimde false döner — çalışan bir hash ezilmesin", () => {
    assert.equal(needsRehash("bu-bir-bcrypt-hash-i-degil"), false);
  });
});

describe("wasteVerifyTime", () => {
  test("her zaman false döner", async () => {
    assert.equal(await wasteVerifyTime("herhangi-bir-sifre"), false);
  });

  test("gerçek doğrulamayla karşılaştırılabilir süre harcar", async () => {
    const hash = await hashPassword("sifre");

    const t1 = process.hrtime.bigint();
    await verifyPassword("yanlis", hash);
    const gercek = Number(process.hrtime.bigint() - t1);

    const t2 = process.hrtime.bigint();
    await wasteVerifyTime("yanlis");
    const sahte = Number(process.hrtime.bigint() - t2);

    // Amaç "hesap yok" yanıtının belirgin biçimde hızlı olmaması. Kesin eşitlik
    // beklenemez (CI gürültüsü); aynı büyüklük mertebesinde olması yeterli.
    const oran = sahte / gercek;
    assert.ok(oran > 0.5 && oran < 2, `süreler yakın olmalı, oran: ${oran.toFixed(2)}`);
  });
});
