import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { EN_COK_DUZEN_NESNESI, ODA_KIMLIGI, odaDuzeniTemizle, odaDuzenleyebilir, studyoDuzenKaydi, studyoOdaDuzenleyebilir } from "./ofisDuzeni";

describe("odaDuzeniTemizle", () => {
  test("bozuk girdi boş düzene düşer", () => {
    for (const ham of [null, undefined, 5, "x", {}, { nesneler: 3 }, []]) assert.deepEqual(odaDuzeniTemizle(ham), { nesneler: {} });
  });

  test("geçerli nesneler kalır, sayılar kırpılır, gizli yalnızca true ise", () => {
    const d = odaDuzeniTemizle({
      nesneler: {
        "masa-0": { dx: 1.23456, dz: 2, don: Math.PI * 3, gizli: "evet" },
        "modul:crm_musteri": { dx: 999, dz: -500, don: 0, gizli: true },
      },
    });
    assert.deepEqual(d.nesneler["masa-0"], { dx: 1.23, dz: 2, don: 3.142 });
    assert.deepEqual(d.nesneler["modul:crm_musteri"], { dx: 80, dz: -80, don: 0, gizli: true });
  });

  test("bilinmeyen kimlik ve eksik konum atılır", () => {
    const d = odaDuzeniTemizle({ nesneler: { "<script>": { dx: 1, dz: 1, don: 0 }, "dekor:bitki": { dx: "1", dz: 1 } } });
    assert.deepEqual(d.nesneler, {});
  });

  test("tavanın üstündeki nesneler alınmaz", () => {
    const nesneler: Record<string, unknown> = {};
    for (let i = 0; i < EN_COK_DUZEN_NESNESI + 30; i++) nesneler[`dekor:n${i}`] = { dx: 1, dz: 1, don: 0 };
    assert.equal(Object.keys(odaDuzeniTemizle({ nesneler }).nesneler).length, EN_COK_DUZEN_NESNESI);
  });
});

describe("odaDuzenleyebilir", () => {
  const dep = "11111111-2222-3333-4444-555555555555";
  test("sahip her odayı düzenler", () => {
    for (const oda of [dep, "toplanti", "ortak"]) assert.equal(odaDuzenleyebilir(oda, { sahip: true, yonettigiDepartmanlar: [] }), true);
  });
  test("departman yöneticisi yalnızca kendi odasını", () => {
    const k = { sahip: false, yonettigiDepartmanlar: [dep] };
    assert.equal(odaDuzenleyebilir(dep, k), true);
    assert.equal(odaDuzenleyebilir("99999999-2222-3333-4444-555555555555", k), false);
    assert.equal(odaDuzenleyebilir("toplanti", k), false);
    assert.equal(odaDuzenleyebilir("ortak", k), false);
  });
  test("oda kimliği biçimi", () => {
    assert.ok(ODA_KIMLIGI.test(dep) && ODA_KIMLIGI.test("toplanti") && ODA_KIMLIGI.test("ortak"));
    assert.ok(!ODA_KIMLIGI.test("koridor-1") && !ODA_KIMLIGI.test("'; drop table"));
  });

  test("eklenen eşya türüyle kalır, türsüz ya da bozuk türlü olan atılır; varsayılanlarda tür yok sayılır", () => {
    const d = odaDuzeniTemizle({
      nesneler: {
        "ek:a1": { dx: 1, dz: 1, don: 0, tur: "monstera" },
        "ek:a2": { dx: 1, dz: 1, don: 0 },
        "ek:a3": { dx: 1, dz: 1, don: 0, tur: "<script>" },
        "masa-0": { dx: 1, dz: 1, don: 0, tur: "kanepe" },
      },
    });
    assert.deepEqual(d.nesneler["ek:a1"], { dx: 1, dz: 1, don: 0, tur: "monstera" });
    assert.equal(d.nesneler["ek:a2"], undefined);
    assert.equal(d.nesneler["ek:a3"], undefined);
    assert.deepEqual(d.nesneler["masa-0"], { dx: 1, dz: 1, don: 0 });
  });

  test("devir yalnızca gizliyle birlikte kalır", () => {
    const d = odaDuzeniTemizle({
      nesneler: {
        "dekor:kose-0": { dx: 1, dz: 1, don: 0, gizli: true, devir: true },
        "dekor:kose-1": { dx: 1, dz: 1, don: 0, devir: true },
      },
    });
    assert.deepEqual(d.nesneler["dekor:kose-0"], { dx: 1, dz: 1, don: 0, gizli: true, devir: true });
    assert.deepEqual(d.nesneler["dekor:kose-1"], { dx: 1, dz: 1, don: 0 });
  });
});

describe("stüdyo düzeni", () => {
  const is = "11111111-2222-3333-4444-555555555555";
  test("iş odası işin kimliğiyle (ekipte ortak), ortak alan ve görüşme odası kişinin", () => {
    assert.deepEqual(studyoDuzenKaydi(is, "u1"), { anahtar: `is:${is}`, job_id: is, user_id: null });
    assert.deepEqual(studyoDuzenKaydi("ortak", "u1"), { anahtar: "kullanici:u1:ortak", job_id: null, user_id: "u1" });
    assert.deepEqual(studyoDuzenKaydi("toplanti", "u1"), { anahtar: "kullanici:u1:toplanti", job_id: null, user_id: "u1" });
  });

  test("iş odasını yalnızca işin sahibi, kendi alanlarını herkes düzenler", () => {
    assert.equal(studyoOdaDuzenleyebilir(is, [is]), true);
    assert.equal(studyoOdaDuzenleyebilir(is, []), false);
    assert.equal(studyoOdaDuzenleyebilir("ortak", []), true);
    assert.equal(studyoOdaDuzenleyebilir("toplanti", []), true);
  });
});
