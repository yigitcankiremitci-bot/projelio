import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { kapakDosyaAdresi, kapakKonumu, kapakOdagiOku, kapakOdagiYaz } from "./kapakOdagi";

const URL_ = "https://storage.projelio.app/department-covers/a/b.jpg";

describe("kapak odağı", () => {
  test("odak yazılır ve aynen okunur", () => {
    const adres = kapakOdagiYaz(URL_, { x: 40, y: 18 });
    assert.equal(adres, `${URL_}#odak=40,18`);
    assert.deepEqual(kapakOdagiOku(adres), { x: 40, y: 18 });
    assert.equal(kapakKonumu(adres), "40% 18%");
  });

  test("yeni odak eskisinin yerine geçer, birikmez", () => {
    const iki = kapakOdagiYaz(kapakOdagiYaz(URL_, { x: 10, y: 10 }), { x: 70, y: 30 });
    assert.equal(iki, `${URL_}#odak=70,30`);
  });

  test("tam orta varsayılan: adres sade kalır", () => {
    assert.equal(kapakOdagiYaz(`${URL_}#odak=10,10`, { x: 50, y: 50 }), URL_);
    assert.equal(kapakOdagiYaz(`${URL_}#odak=10,10`, null), URL_);
  });

  test("odaksız adres eskisi gibi ortalanır", () => {
    assert.equal(kapakOdagiOku(URL_), undefined);
    assert.equal(kapakKonumu(URL_), "center");
    assert.equal(kapakKonumu(undefined), "center");
  });

  test("sınır dışı değerler kırpılır", () => {
    assert.equal(kapakOdagiYaz(URL_, { x: -20, y: 140 }), `${URL_}#odak=0,100`);
    assert.deepEqual(kapakOdagiOku(`${URL_}#odak=300,5`), { x: 100, y: 5 });
  });

  test("dosya adresi odaktan ayrılır", () => {
    assert.equal(kapakDosyaAdresi(`${URL_}#odak=1,2`), URL_);
    assert.equal(kapakDosyaAdresi(URL_), URL_);
  });
});
