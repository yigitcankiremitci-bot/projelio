import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BaglantiTaslaklari } from "./baglanti-taslaklari";

// Kartvizit okuması yanlış olabilir; taslak kullanıcıya gösterilmeden kayda
// dönüşmemeli. Buradaki gerileme yanlış okunmuş kişileri sessizce deftere yazar.

describe("BaglantiTaslaklari", () => {
  test("aynı turda onaylanamaz; kullanıcının yeni mesajından sonra onaylanır", () => {
    const d = new BaglantiTaslaklari<string>();
    const t = d.olustur("u1", "plan");
    assert.equal(d.al("u1", t.id)?.sunuldu, false);
    d.yeniMesaj("u1");
    assert.equal(d.al("u1", t.id)?.sunuldu, true);
  });

  test("yeni mesajdan SONRA oluşan taslak gösterilmiş sayılmaz", () => {
    const d = new BaglantiTaslaklari<string>();
    d.yeniMesaj("u1");
    const t = d.olustur("u1", "plan");
    assert.equal(d.al("u1", t.id)?.sunuldu, false);
  });

  test("başka kullanıcının mesajı ve taslağı karışmaz", () => {
    const d = new BaglantiTaslaklari<string>();
    const t = d.olustur("u1", "plan");
    d.yeniMesaj("u2");
    assert.equal(d.al("u1", t.id)?.sunuldu, false);
    assert.equal(d.al("u2", t.id), undefined);
  });

  test("bir saat sonra taslak düşer", () => {
    let simdi = 0;
    const d = new BaglantiTaslaklari<string>(() => simdi);
    const t = d.olustur("u1", "plan");
    simdi = 61 * 60 * 1000;
    assert.equal(d.al("u1", t.id), undefined);
  });
});
