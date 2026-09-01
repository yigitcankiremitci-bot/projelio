import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MODULE_FORM_CONFIGS, changedFields, isFormModule, missingForApproval } from "./index";
import { kimlikVeYonConfig } from "./kimlikVeYon";

// A1 (Form / Doküman) motorunun kuralları.
//
// Buradaki iki fonksiyon ekranın iki kararını verir: "onaylanabilir mi" ve
// "onaylanmamış değişiklik var mı". İkisi de yanlış çalışırsa kullanıcı ya
// yarım metin yayımlar ya da değiştirdiğini sanıp eski metni yayında bırakır.

describe("missingForApproval — yarım metin yayımlanamaz", () => {
  test("boş kayıtta onay için gerekli alanlar listelenir", () => {
    const missing = missingForApproval(kimlikVeYonConfig, {});
    assert.deepEqual(missing, ["Vizyon", "Misyon"]);
  });

  test("yalnızca boşluk içeren değer dolu sayılmaz", () => {
    const missing = missingForApproval(kimlikVeYonConfig, { vision: "   ", mission: "Bir şey" });
    assert.deepEqual(missing, ["Vizyon"]);
  });

  test("gerekli alanlar dolduğunda onaylanabilir", () => {
    const missing = missingForApproval(kimlikVeYonConfig, { vision: "A", mission: "B" });
    assert.deepEqual(missing, []);
  });

  test("onay için gerekli OLMAYAN alanlar onayı engellemez", () => {
    // Değerler, konumlandırma, zaman ufku… hepsi boş olabilir.
    const missing = missingForApproval(kimlikVeYonConfig, { vision: "A", mission: "B", values: "" });
    assert.deepEqual(missing, []);
  });
});

describe("changedFields — taslak ile yürürlükteki metnin farkı", () => {
  const current = { vision: "Eski vizyon", mission: "Misyon", horizon: "y5" };

  test("taslak yoksa değişiklik yok", () => {
    assert.deepEqual(changedFields(kimlikVeYonConfig, current, null), []);
  });

  test("aynı içerikli taslak değişiklik saymaz", () => {
    assert.deepEqual(changedFields(kimlikVeYonConfig, current, { ...current }), []);
  });

  test("değişen alan etiketiyle bildirilir", () => {
    const changed = changedFields(kimlikVeYonConfig, current, { ...current, vision: "Yeni vizyon" });
    assert.deepEqual(changed, ["Vizyon"]);
  });

  test("boş bırakılan alan da değişikliktir", () => {
    // Silme sessizce yayımlanmamalı: kullanıcı bir cümleyi kaldırdıysa bu da
    // onay bekleyen bir değişikliktir.
    const changed = changedFields(kimlikVeYonConfig, current, { ...current, horizon: "" });
    assert.deepEqual(changed, ["Zaman ufku"]);
  });

  test("tanımlı olmayan anahtarlar yok sayılır", () => {
    // Şema değiştiğinde eski kayıtlarda artık kullanılmayan anahtarlar kalabilir;
    // bunlar "değişiklik var" uyarısı üretmemeli.
    const changed = changedFields(kimlikVeYonConfig, current, { ...current, eskiAlan: "x" });
    assert.deepEqual(changed, []);
  });
});

describe("konfigürasyon tutarlılığı", () => {
  test("her alan tanımlı bir bölüme ait", () => {
    for (const [key, config] of Object.entries(MODULE_FORM_CONFIGS)) {
      const groups = new Set(config.groups.map((g) => g.key));
      for (const field of config.fields) {
        assert.ok(groups.has(field.group), `${key}: "${field.key}" alanı tanımsız bölümde (${field.group})`);
      }
    }
  });

  test("alan anahtarları modül içinde benzersiz", () => {
    for (const [key, config] of Object.entries(MODULE_FORM_CONFIGS)) {
      const keys = config.fields.map((f) => f.key);
      assert.equal(new Set(keys).size, keys.length, `${key}: yinelenen alan anahtarı var`);
    }
  });

  test("varlık kapsamlı modülde kapsam alanı form alanı DEĞİLDİR", () => {
    // Kapsam kaydın kimliğidir; form alanı olsaydı kullanıcı onu değiştirip
    // dokümanı başka bir varlığa taşıyabilirdi.
    for (const [key, config] of Object.entries(MODULE_FORM_CONFIGS)) {
      if (config.scope !== "entity") continue;
      assert.ok(config.scopeFieldKey, `${key}: varlık kapsamında scopeFieldKey zorunlu`);
      assert.ok(
        !config.fields.some((f) => f.key === config.scopeFieldKey),
        `${key}: kapsam alanı (${config.scopeFieldKey}) form alanı olarak da tanımlanmış`
      );
    }
  });

  test("şablonlar yalnızca tanımlı alanları doldurur", () => {
    for (const [key, config] of Object.entries(MODULE_FORM_CONFIGS)) {
      const keys = new Set(config.fields.map((f) => f.key));
      for (const t of config.templates ?? []) {
        for (const k of Object.keys(t.data)) {
          assert.ok(keys.has(k), `${key}/${t.key}: şablon tanımsız alan yazıyor (${k})`);
        }
      }
    }
  });

  test("onay için gerekli alanı olmayan form olmaz", () => {
    // Hiçbir alanı zorunlu olmayan bir doküman boş yayımlanabilirdi.
    for (const [key, config] of Object.entries(MODULE_FORM_CONFIGS)) {
      assert.ok(
        config.fields.some((f) => f.requiredForApproval),
        `${key}: onay için gerekli en az bir alan olmalı`
      );
    }
  });

  test("isFormModule yalnızca kayıtlı anahtarlar için doğru", () => {
    assert.equal(isFormModule("kimlik_ve_yon"), true);
    assert.equal(isFormModule("pd_marka_kimligi"), true);
    assert.equal(isFormModule("fm_gelir_gider"), false);
    // Hukuk'un tescil modülü marka kimliği DEĞİL: adı benzediği için sık
    // karıştırılıyor, A2 kayıt defteri olarak kalıyor.
    assert.equal(isFormModule("hud_marka_patent_telif"), false);
  });
});
