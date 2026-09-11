import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";
import { abonelikImzasi, abonelikImzasiGecerliMi, abonelikKapatmaAdresi } from "./notification-email.abonelik";

// Gizli anahtar İMZA ANINDA okunuyor (getJwtSecret her çağrıda process.env'e
// bakıyor), bu yüzden modülü dinamik yüklemeye gerek yok — testten önce
// kurmak yetiyor.
before(() => {
  process.env.JWT_SECRET ??= "test-gizli-anahtar-en-az-32-karakter-olsun";
});

const KULLANICI = "11111111-2222-4333-8444-555555555555";

describe("abonelik imzası", () => {
  it("aynı kullanıcı için kararlı — e-posta yıllar sonra açılsa da çalışmalı", () => {
    assert.equal(abonelikImzasi(KULLANICI), abonelikImzasi(KULLANICI));
  });

  it("kullanıcıya özel", () => {
    assert.notEqual(abonelikImzasi(KULLANICI), abonelikImzasi("99999999-2222-4333-8444-555555555555"));
  });

  it("kendi imzasını kabul eder", () => {
    assert.equal(abonelikImzasiGecerliMi(KULLANICI, abonelikImzasi(KULLANICI)), true);
  });

  it("başka kullanıcının imzasıyla kapatılamaz", () => {
    const baskasi = abonelikImzasi("99999999-2222-4333-8444-555555555555");
    assert.equal(abonelikImzasiGecerliMi(KULLANICI, baskasi), false);
  });

  it("boş, eksik ve yanlış uzunluktaki değerleri reddeder", () => {
    assert.equal(abonelikImzasiGecerliMi(KULLANICI, ""), false);
    assert.equal(abonelikImzasiGecerliMi(KULLANICI, undefined), false);
    assert.equal(abonelikImzasiGecerliMi(KULLANICI, 123), false);
    assert.equal(abonelikImzasiGecerliMi(KULLANICI, abonelikImzasi(KULLANICI).slice(0, 10)), false);
  });

  it("adres kullanıcı kimliğini ve imzayı taşır", () => {
    const adres = abonelikKapatmaAdresi(KULLANICI);
    assert.ok(adres.includes(`u=${KULLANICI}`));
    assert.ok(adres.includes(`i=${abonelikImzasi(KULLANICI)}`));
    assert.ok(adres.includes("/notifications/eposta-kapat"));
  });
});
