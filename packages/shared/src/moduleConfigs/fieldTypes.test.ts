import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MODULE_RECORD_CONFIGS } from "./index";
import {
  CURRENCY_OPTIONS,
  currencyField,
  displayReference,
  isReferenceValue,
  partyField,
  userField,
  type ModuleRecordConfig,
} from "./shared";

// Faz 2 alan tipleri. En kritik davranış geriye dönük uyumluluk: bu alanlar
// eskiden serbest metindi ve mevcut kayıtlarda ham ad duruyor — referansa
// çevrilmeleri hiçbir veriyi görünmez yapmamalı.

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("isReferenceValue", () => {
  test("UUID referanstır", () => {
    assert.equal(isReferenceValue(UUID), true);
    assert.equal(isReferenceValue(UUID.toUpperCase()), true);
  });

  test("serbest metin referans değildir", () => {
    // Alan referansa çevrilmeden önce girilmiş kayıtlar böyle görünür.
    assert.equal(isReferenceValue("ABC Ltd. Şti."), false);
    assert.equal(isReferenceValue("Ahmet Yılmaz"), false);
    assert.equal(isReferenceValue(""), false);
  });

  test("UUID'ye benzeyen ama olmayan değerler reddedilir", () => {
    assert.equal(isReferenceValue("0f8fad5b-d9cb-469f-a165"), false);
    assert.equal(isReferenceValue("zzzzzzzz-d9cb-469f-a165-70867728950e"), false);
  });

  test("metin olmayan değerler referans değildir", () => {
    assert.equal(isReferenceValue(123), false);
    assert.equal(isReferenceValue(null), false);
    assert.equal(isReferenceValue(undefined), false);
  });
});

describe("displayReference — eski veri korunur", () => {
  const resolve = (id: string) => (id === UUID ? "ABC Yazılım" : undefined);

  test("çözülen referans ad olarak görünür", () => {
    assert.equal(displayReference(UUID, resolve), "ABC Yazılım");
  });

  test("eski serbest metin OLDUĞU GİBİ görünür", () => {
    // Veri kaybı olmaz: kullanıcı isterse listeden gerçek kaydı seçer.
    assert.equal(displayReference("Eski Müşteri Adı", resolve), "Eski Müşteri Adı");
  });

  test("silinmiş kayıt yer tutucuyla gösterilir", () => {
    const silinmis = "11111111-2222-3333-4444-555555555555";
    assert.equal(displayReference(silinmis, resolve), "(silinmiş kayıt)");
  });

  test("boş değer undefined döner", () => {
    assert.equal(displayReference("", resolve), undefined);
    assert.equal(displayReference(null, resolve), undefined);
    assert.equal(displayReference(undefined, resolve), undefined);
  });
});

describe("alan üreticileri", () => {
  test("currencyField iki anahtar yönetir", () => {
    const f = currencyField("amount", "Tutar", { required: true });
    assert.equal(f.type, "currency");
    assert.equal(f.key, "amount");
    assert.equal(f.currencyKey, "currency");
    assert.equal(f.required, true);
    assert.deepEqual(f.options, CURRENCY_OPTIONS);
  });

  test("partyField eski metni tolere eder", () => {
    const f = partyField("customerName", "Müşteri", { entityRole: "customer" });
    assert.equal(f.type, "entity_ref");
    assert.equal(f.entity, "party");
    assert.equal(f.legacyText, true, "eski serbest metin değerler korunmalı");
    assert.equal(f.creatable, true, "satır içi müşteri açılabilmeli");
    assert.equal(f.entityRole, "customer");
  });

  test("userField eski metni tolere eder", () => {
    const f = userField("owner", "Sorumlu");
    assert.equal(f.type, "user_ref");
    assert.equal(f.legacyText, true);
  });
});

describe("modül tanımlarında tip kullanımı", () => {
  const entries = Object.entries(MODULE_RECORD_CONFIGS);
  const fieldsOfType = (type: string) =>
    entries.flatMap(([key, c]) => c.fields.filter((f) => f.type === type).map((f) => ({ key, field: f })));

  test("karşı taraf alanları referansa çevrildi", () => {
    const refs = fieldsOfType("entity_ref");
    assert.ok(refs.length >= 8, `beklenenden az entity_ref: ${refs.length}`);
    for (const { key, field } of refs) {
      assert.equal(field.entity, "party", `${key}.${field.key} varlık belirtmemiş`);
      assert.equal(field.legacyText, true, `${key}.${field.key} eski metni korumuyor`);
    }
  });

  test("sorumlu alanları kullanıcı referansına çevrildi", () => {
    const refs = fieldsOfType("user_ref");
    assert.ok(refs.length >= 6, `beklenenden az user_ref: ${refs.length}`);
  });

  test("tutar alanları tek currency alanına indi", () => {
    const money = fieldsOfType("currency");
    assert.ok(money.length >= 7, `beklenenden az currency: ${money.length}`);
    for (const { key, field } of money) {
      assert.ok(field.currencyKey, `${key}.${field.key} para birimi anahtarı yok`);
    }
  });

  test("ayrı 'Para birimi' select alanı kalmadı", () => {
    // Eskiden her modül number + ayrı select tanımlıyordu; kullanıcı iki alan
    // görüyordu ve tanımlar arasında tutarsızlık kolaydı.
    for (const [key, config] of entries) {
      const ayri = config.fields.find((f) => f.key === "currency" && f.type === "select");
      assert.equal(ayri, undefined, `${key} hâlâ ayrı para birimi alanı taşıyor`);
    }
  });

  test("currency alanı olan her modülde para birimi anahtarı çakışmıyor", () => {
    for (const [key, config] of entries) {
      const money = config.fields.filter((f) => f.type === "currency");
      const currencyKeys = money.map((f) => f.currencyKey ?? "currency");
      // İki tutar alanı aynı para birimi anahtarını paylaşırsa biri diğerini ezer.
      if (money.length > 1) {
        assert.equal(
          new Set(currencyKeys).size,
          currencyKeys.length,
          `${key}: birden fazla tutar alanı aynı para birimi anahtarını kullanıyor`
        );
      }
    }
  });

  test("referans alanları hâlâ zorunluluk kurallarına uyuyor", () => {
    // Zorunlu bir referans alanı boş bırakılamaz; doğrulama tip değişiminden
    // sonra da çalışmalı.
    const zorunlu = [...fieldsOfType("entity_ref"), ...fieldsOfType("user_ref")].filter((x) => x.field.required);
    for (const { key, field } of zorunlu) {
      assert.ok(field.label.length > 0, `${key}.${field.key} etiketsiz`);
    }
  });
});

describe("formula alanları", () => {
  test("hesaplanan alan tanımlıysa compute fonksiyonu da vardır", () => {
    for (const [key, config] of Object.entries(MODULE_RECORD_CONFIGS) as [string, ModuleRecordConfig][]) {
      for (const f of config.fields) {
        if (f.type === "formula") {
          assert.equal(typeof f.compute, "function", `${key}.${f.key} compute fonksiyonu yok`);
        }
      }
    }
  });
});
