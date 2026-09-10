import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dakikayiMetneCevir, sureyiDakikayaCevir } from "./workLogDuration";

// Bu parser üç yerde birden kullanılıyor (web girişi, Lio aracı, backend
// doğrulaması). Buradaki bir gerileme, aynı metnin üç yerde farklı süreye
// dönüşmesi demek — kullanıcının hangisinin doğru olduğunu anlaması imkânsız.

describe("sureyiDakikayaCevir", () => {
  test("çıplak tam sayı dakikadır, çıplak ondalık saattir", () => {
    assert.equal(sureyiDakikayaCevir("45"), 45);
    assert.equal(sureyiDakikayaCevir("1.5"), 90);
    assert.equal(sureyiDakikayaCevir("1,5"), 90);
  });

  test("birimli yazımlar", () => {
    assert.equal(sureyiDakikayaCevir("90dk"), 90);
    assert.equal(sureyiDakikayaCevir("90 dakika"), 90);
    assert.equal(sureyiDakikayaCevir("2s"), 120);
    assert.equal(sureyiDakikayaCevir("2 saat"), 120);
    assert.equal(sureyiDakikayaCevir("1.5 saat"), 90);
  });

  test("saat + dakika birlikte", () => {
    assert.equal(sureyiDakikayaCevir("1s 30dk"), 90);
    assert.equal(sureyiDakikayaCevir("1s30"), 90);
    assert.equal(sureyiDakikayaCevir("2 saat 15 dakika"), 135);
    assert.equal(sureyiDakikayaCevir("1:30"), 90);
    assert.equal(sureyiDakikayaCevir("0:20"), 20);
  });

  test("büyük harf ve boşluk sorun değil", () => {
    assert.equal(sureyiDakikayaCevir("  2 SAAT  "), 120);
    assert.equal(sureyiDakikayaCevir("2 Saat 5 Dakika"), 125);
  });

  test("anlaşılmayan girdi null döner — 0 değil", () => {
    assert.equal(sureyiDakikayaCevir(""), null);
    assert.equal(sureyiDakikayaCevir("   "), null);
    assert.equal(sureyiDakikayaCevir(null), null);
    assert.equal(sureyiDakikayaCevir(undefined), null);
    assert.equal(sureyiDakikayaCevir("birazcık"), null);
    assert.equal(sureyiDakikayaCevir("1 elma"), null);
  });

  test("sıfır ve aralık dışı reddedilir, kırpılmaz", () => {
    assert.equal(sureyiDakikayaCevir("0"), null);
    assert.equal(sureyiDakikayaCevir("0dk"), null);
    // 25 saat: neredeyse her zaman bir giriş hatası. Sessizce 24 saate
    // kırpsaydık kullanıcı yanlış yazdığını hiç fark etmezdi.
    assert.equal(sureyiDakikayaCevir("25 saat"), null);
    assert.equal(sureyiDakikayaCevir("1441"), null);
    assert.equal(sureyiDakikayaCevir("24 saat"), 1440);
  });

  test("sayı da kabul edilir (Lio doğrudan dakika gönderiyor)", () => {
    assert.equal(sureyiDakikayaCevir(45), 45);
    assert.equal(sureyiDakikayaCevir(0), null);
    assert.equal(sureyiDakikayaCevir(5000), null);
  });
});

describe("dakikayiMetneCevir", () => {
  test("saat ve dakika kısaltılır", () => {
    assert.equal(dakikayiMetneCevir(45), "45dk");
    assert.equal(dakikayiMetneCevir(60), "1s");
    assert.equal(dakikayiMetneCevir(90), "1s 30dk");
    assert.equal(dakikayiMetneCevir(135), "2s 15dk");
  });

  test("süresiz kayıtlar boş metin", () => {
    assert.equal(dakikayiMetneCevir(null), "");
    assert.equal(dakikayiMetneCevir(undefined), "");
    assert.equal(dakikayiMetneCevir(0), "");
  });
});
