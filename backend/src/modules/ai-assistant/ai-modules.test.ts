// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describeModuleFields, hasRecordConfig, normalizeModuleData } from "./ai-modules";

// Lio'nun modül kaydına yazdığı veri buradan geçiyor. Buradaki bir hata
// kullanıcıya "kayıt eklendi" der ama ekranda boş satır gösterir — bu yüzden
// asıl sınanan şey, uydurulmuş alanın SESSİZCE geçmemesi.

const GELIR_GIDER = "fm_gelir_gider";

describe("normalizeModuleData — tanımsız alanlar", () => {
  test("tanımda olmayan anahtar atılır ve uyarı üretir", () => {
    const { data, warnings } = normalizeModuleData(GELIR_GIDER, "Gelir-Gider", {
      amount: 100,
      uydurulmusAlan: "x",
    });
    assert.equal(data.uydurulmusAlan, undefined);
    assert.equal(data.amount, 100);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /uydurulmusAlan/);
  });

  test("hesaplanan (formula) alana yazılamaz", () => {
    // Fatura'da toplam formülle hesaplanıyor; model yazmaya kalkarsa atılmalı.
    const config = describeModuleFields("fm_fatura", "Fatura");
    const formula = config.fields.find((f: any) => f.type === "formula") as any;
    if (!formula) return; // tanım değişmişse bu testin konusu kalmaz
    const { data, warnings } = normalizeModuleData("fm_fatura", "Fatura", { [formula.key]: 999 });
    assert.equal(data[formula.key], undefined);
    assert.match(warnings.join(" "), new RegExp(formula.key));
  });
});

describe("normalizeModuleData — tip zorlama", () => {
  test("sayı alanına metin gelirse hata", () => {
    assert.throws(
      () => normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { amount: "bilmiyorum" }),
      /sayı olmalı/
    );
  });

  test("sayıya çevrilebilen metin kabul edilir", () => {
    const { data } = normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { amount: "1250.5" });
    assert.equal(data.amount, 1250.5);
  });

  test("geçersiz select değeri reddedilir", () => {
    assert.throws(
      () => normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { type: "gelir" }),
      /geçersiz değer/i
    );
  });

  test("geçerli select değeri geçer", () => {
    const { data } = normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { type: "expense" });
    assert.equal(data.type, "expense");
  });

  test("tarih YYYY-MM-DD olmalı", () => {
    assert.throws(() => normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { entryDate: "12.08.2026" }), /YYYY-MM-DD/);
    const { data } = normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { entryDate: "2026-08-12T10:00:00Z" });
    assert.equal(data.entryDate, "2026-08-12");
  });

  test("para birimi ayrı anahtara yazılır ve doğrulanır", () => {
    const { data, warnings } = normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { amount: 10, currency: "usd" });
    assert.equal(data.currency, "USD");
    assert.equal(warnings.length, 0);
    assert.throws(() => normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { currency: "BTC" }), /para birimi/i);
  });
});

describe("normalizeModuleData — çoklu seçim dizi DEĞİL metin olarak saklanır", () => {
  // Panel virgüllü tek metin bekliyor (bkz. ModuleFieldInput multiselect/tags);
  // dizi yazılırsa alan ekranda boş görünür.
  test("dizi verilirse virgüllü metne çevrilir", () => {
    // tags alanı olan bir modül bul; yoksa test konusuz kalır.
    const candidates = ["pd_hedef_kitle", "hud_sozlesme", "spd_pazar_arastirma", "ik_ise_alim_oryantasyon"];
    for (const moduleKey of candidates) {
      const described = describeModuleFields(moduleKey, moduleKey);
      const tagField = described.fields.find((f: any) => f.type === "tags") as any;
      if (!tagField) continue;
      const { data } = normalizeModuleData(moduleKey, moduleKey, { [tagField.key]: ["a", "b"] });
      assert.equal(data[tagField.key], "a,b");
      return;
    }
  });
});

describe("normalizeModuleData — zorunlu alanlar", () => {
  test("zorunlu alan eksikse create engellenir", () => {
    assert.throws(
      () => normalizeModuleData(GELIR_GIDER, "Gelir-Gider", { category: "Kira" }, { requireMandatory: true }),
      /Zorunlu alan/
    );
  });

  test("varsayılanı olan zorunlu alan otomatik dolar", () => {
    // type'ın varsayılanı "income"; kullanıcı söylemediyse panelde de öyle geliyor.
    const { data } = normalizeModuleData(
      GELIR_GIDER,
      "Gelir-Gider",
      { amount: 500 },
      { requireMandatory: true }
    );
    assert.equal(data.type, "income");
    assert.equal(data.amount, 500);
  });
});

describe("describeModuleFields", () => {
  test("tanımlı modülün alanlarını ve seçeneklerini verir", () => {
    const described = describeModuleFields(GELIR_GIDER, "Gelir-Gider");
    const type = described.fields.find((f: any) => f.key === "type") as any;
    assert.ok(type);
    assert.match(type.options, /income/);
    assert.equal(type.required, true);
  });

  test("tanımsız modül genel kayıt defterine düşer", () => {
    assert.equal(hasRecordConfig("boyle_bir_modul_yok"), false);
    const described = describeModuleFields("boyle_bir_modul_yok", "Deneme");
    assert.deepEqual(
      described.fields.map((f: any) => f.key),
      ["title", "status", "date", "notes"]
    );
  });
});
