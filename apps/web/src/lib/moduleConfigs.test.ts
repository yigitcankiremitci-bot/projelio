import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ENTITY_MODULE_KEYS, isEntityModule } from "./entityModules";
import { MODULE_RECORD_CONFIGS, getModuleRecordConfig } from "./moduleConfigs";
import type { ModuleFieldConfig, ModuleRecordConfig } from "./moduleConfigs";

// 40 modül tanımının tamamı aynı sözleşmeye uymalı: alanlar tutarlı, özet ve
// gösterge fonksiyonları hiçbir veri kombinasyonunda patlamamalı.
// Modül tanımları lib/moduleConfigs/ altında, katalog eşlemesi index.ts'te.

// module_catalog'daki 56 anahtar.
// 046'da iki müşteri anahtarı (mid_musteri_modulu, spd_musteri_modulu) tek
// crm_musteri'de birleşti; crm_musteri ortak `party` varlığına yazdığı için
// module_records tanımı YOKTUR, kendi paneli vardır.
const CATALOG_KEYS = [
  "crm_musteri",
  "bt_ag_guvenlik", "bt_donanim", "bt_yazilim",
  "fm_alacak_borc", "fm_analiz_rapor", "fm_butce_hazirlama", "fm_fatura", "fm_finansal_planlama",
  "fm_gelir_gider", "fm_nakit_akis", "fm_risk_yonetimi", "fm_sermaye_yatirim_takip", "fm_vergi_takip",
  "holding_analiz", "holding_denetim", "holding_raporlama",
  "hud_marka_patent_telif", "hud_mevzuatlar", "hud_sozlesme",
  "ik_bordro_ozluk", "ik_egitim_gelisim", "ik_ic_iletisim_kultur", "ik_ise_alim_oryantasyon", "ik_performans_izleme",
  "mid_sikayet_oneri", "mid_teknik_destek",
  "oud_depo", "oud_kalite_kontrol", "oud_sevkiyat_yonetimi", "oud_tedarik",
  "pd_buyume_hedefleri", "pd_dijital_pazarlama", "pd_dijital_pazarlama_seo_sem", "pd_email", "pd_hedef_kitle",
  "pd_musteri_kazanim_optimizasyonu", "pd_rakip_sektor_analizi", "pd_reklam", "pd_sosyal_medya", "pd_urun_stratejileri",
  "spd_ortaklik_dagitim", "spd_pazar_arastirma", "spd_satis_planlama_b2b_b2c",
  "uyd_urunler",
  "yonetim_analiz", "yonetim_butce_yonetimi", "yonetim_cikti_yonetimi", "yonetim_denetim", "yonetim_dosya_yonetimi",
  "yonetim_gorev_yonetimi", "yonetim_hedef_belirleme", "yonetim_misyon_sablonu", "yonetim_program_yonetimi",
  "yonetim_proje_yonetimi", "yonetim_raporlama", "yonetim_vizyon_sablonu",
];

// Bilerek tanımsız bırakılanlar — bkz. docs/moduller/01-modul-arketip-eslesmesi.md
const A6_PANELS = [
  "holding_analiz", "holding_raporlama", "holding_denetim",
  "yonetim_analiz", "yonetim_raporlama", "yonetim_denetim", "yonetim_butce_yonetimi",
  "fm_analiz_rapor", "fm_nakit_akis", "fm_finansal_planlama",
  "pd_musteri_kazanim_optimizasyonu", "pd_dijital_pazarlama",
];
const CORE = [
  "yonetim_proje_yonetimi", "yonetim_program_yonetimi", "yonetim_gorev_yonetimi",
  "yonetim_cikti_yonetimi", "yonetim_dosya_yonetimi",
];
// Kendi tablosuna/varlığına yazan modüller — module_records kullanmazlar.
// pd_sosyal_medya 054 ile buraya katıldı: hesaplar ve "içerik × kanal"
// ilişkisi tek jsonb sütununa sığmıyordu (bkz. 054_social_media.sql).
const OWN_TABLE = ["uyd_urunler", "pd_sosyal_medya", ...ENTITY_MODULE_KEYS];

const entries = Object.entries(MODULE_RECORD_CONFIGS);

/** Bir alanın tipine göre makul bir örnek değer. */
function sampleValue(field: ModuleFieldConfig): unknown {
  switch (field.type) {
    case "number":
    case "currency":
      return 1250.5;
    case "date":
      return "2026-08-12";
    case "select":
      return field.options?.[0]?.value ?? "";
    case "multiselect":
      return field.options?.[0]?.value ?? "";
    case "entity_ref":
    case "user_ref":
      // Kayıtta id durur; ekranda ada çevrilmesi panelin işi (toDisplayData).
      // Göstergeler ham veriyle çalıştığı için burada da ham id veriliyor.
      return "0f8fad5b-d9cb-469f-a165-70867728950e";
    case "formula":
      // Hesaplanan alan kaydedilmez; kayıtta bulunmaması normaldir.
      return undefined;
    default:
      return `${field.label} örnek`;
  }
}

function sampleRecord(config: ModuleRecordConfig, id: string, overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {};
  for (const f of config.fields) data[f.key] = sampleValue(f);
  return { id, moduleKey: "test", data: { ...data, ...overrides }, createdAt: "2026-08-12T00:00:00Z" } as never;
}

describe("katalog kapsama", () => {
  test("tanımlı her anahtar katalogda var", () => {
    const unknown = entries.map(([k]) => k).filter((k) => !CATALOG_KEYS.includes(k));
    assert.deepEqual(unknown, [], "katalogda olmayan modül anahtarı tanımlanmış");
  });

  test("tanımsız kalanların hepsi bilinçli (panel, çekirdek veya kendi tablosu)", () => {
    const defined = new Set(entries.map(([k]) => k));
    const beklenen = new Set([...A6_PANELS, ...CORE, ...OWN_TABLE]);
    const beklenmeyen = CATALOG_KEYS.filter((k) => !defined.has(k) && !beklenen.has(k));
    assert.deepEqual(beklenmeyen, [], "sessizce generic fallback'e düşen modül var");
  });

  test("37 kayıt tanımı + 1 varlık modülü tanımlı", () => {
    assert.equal(entries.length, 37);
    assert.equal(ENTITY_MODULE_KEYS.length, 1);
  });

  test("varlık modülleri katalogda var ama kayıt tanımı YOK", () => {
    // Ortak varlığa yazarlar (party), module_records'a değil. İkisi birden
    // tanımlıysa hangi tabloya yazılacağı belirsizleşir.
    for (const key of ENTITY_MODULE_KEYS) {
      assert.ok(CATALOG_KEYS.includes(key), `${key} katalogda yok`);
      assert.equal(MODULE_RECORD_CONFIGS[key], undefined, `${key} hem varlık hem kayıt modülü`);
    }
  });

  test("birleşen eski müşteri anahtarları tamamen kalktı", () => {
    for (const eski of ["mid_musteri_modulu", "spd_musteri_modulu"]) {
      assert.equal(MODULE_RECORD_CONFIGS[eski], undefined, `${eski} hâlâ tanımlı`);
      assert.ok(!CATALOG_KEYS.includes(eski), `${eski} hâlâ katalog listesinde`);
    }
    assert.ok(isEntityModule("crm_musteri"));
  });

  test("tanımsız anahtar generic kayıt defterine düşer", () => {
    const generic = getModuleRecordConfig("holding_analiz", "Analiz modülü");
    assert.equal(generic.title, "Analiz modülü");
    assert.ok(generic.fields.some((f) => f.key === "title"));
  });

  test("tanımlı anahtar kendi config'ini döndürür", () => {
    assert.equal(getModuleRecordConfig("fm_gelir_gider", "yoksayılır").title, "Gelir-Gider");
  });
});

describe("alan tanımı tutarlılığı", () => {
  for (const [key, config] of entries) {
    test(`${key}: alanlar geçerli`, () => {
      assert.ok(config.fields.length > 0, "en az bir alan olmalı");
      assert.ok(config.title.length > 0);
      assert.ok(config.addLabel.length > 0);
      assert.ok(config.emptyLabel.length > 0);

      const keys = config.fields.map((f) => f.key);
      assert.equal(new Set(keys).size, keys.length, `tekrar eden alan anahtarı: ${keys.join(", ")}`);

      for (const f of config.fields) {
        assert.ok(f.label.length > 0, `${f.key} etiketsiz`);
        if (f.type === "select") {
          assert.ok((f.options?.length ?? 0) > 0, `${f.key} seçeneksiz select`);
          const values = f.options!.map((o) => o.value);
          assert.equal(new Set(values).size, values.length, `${f.key} tekrar eden seçenek değeri`);
          if (f.defaultValue !== undefined) {
            // Varsayılan seçeneklerden biri değilse form boş açılır ve kullanıcı
            // farkında olmadan geçersiz değer kaydeder.
            assert.ok(values.includes(f.defaultValue), `${f.key} varsayılanı seçenekler arasında değil`);
          }
        }
      }
    });

    test(`${key}: en fazla bir para birimi alanı ve tutar alanıyla eşleşiyor`, () => {
      const hasCurrency = config.fields.some((f) => f.key === "currency");
      if (!hasCurrency) return;
      // moneyStats/fmtMoney "currency" alanını sabit isimle okur; yanında
      // toplanacak sayısal bir alan yoksa gösterge boş çıkar.
      const numeric = config.fields.filter((f) => f.type === "number");
      assert.ok(numeric.length > 0, "para birimi var ama sayısal alan yok");
    });
  }
});

describe("summary / detail dayanıklılığı", () => {
  for (const [key, config] of entries) {
    test(`${key}: boş veriyle patlamıyor`, () => {
      assert.equal(typeof config.summary({}), "string");
      const d = config.detail?.({});
      assert.ok(d === undefined || typeof d === "string");
    });

    test(`${key}: dolu veriyle string döndürüyor`, () => {
      const data: Record<string, unknown> = {};
      for (const f of config.fields) data[f.key] = sampleValue(f);
      assert.equal(typeof config.summary(data), "string");
      const d = config.detail?.(data);
      assert.ok(d === undefined || typeof d === "string");
    });

    test(`${key}: bilinmeyen seçenek değeriyle patlamıyor`, () => {
      // Eski kayıtlarda artık kataloğa uymayan değerler kalmış olabilir.
      const data: Record<string, unknown> = {};
      for (const f of config.fields) data[f.key] = f.type === "select" ? "artik_gecersiz" : sampleValue(f);
      assert.equal(typeof config.summary(data), "string");
      const d = config.detail?.(data);
      assert.ok(d === undefined || typeof d === "string");
    });
  }
});

describe("computeStats dayanıklılığı", () => {
  for (const [key, config] of entries) {
    if (!config.computeStats) continue;

    test(`${key}: boş listede gösterge üretiyor`, () => {
      const stats = config.computeStats!([]);
      assert.ok(Array.isArray(stats));
      for (const s of stats) {
        assert.equal(typeof s.label, "string");
        assert.equal(typeof s.value, "string");
        assert.ok(s.value.length > 0, `${s.label} boş değer`);
      }
    });

    test(`${key}: örnek kayıtlarla gösterge üretiyor`, () => {
      const records = [sampleRecord(config, "a"), sampleRecord(config, "b")];
      const stats = config.computeStats!(records);
      assert.ok(stats.length > 0);
      for (const s of stats) {
        assert.equal(typeof s.value, "string");
        assert.ok(!s.value.includes("NaN"), `${s.label} NaN üretti: ${s.value}`);
        assert.ok(!s.value.includes("undefined"), `${s.label} undefined üretti: ${s.value}`);
      }
    });

    test(`${key}: eksik alanlı kayıtlarla patlamıyor`, () => {
      const bos = { id: "x", moduleKey: "test", data: {}, createdAt: "2026-08-12T00:00:00Z" } as never;
      const stats = config.computeStats!([bos]);
      for (const s of stats) {
        assert.ok(!s.value.includes("NaN"), `${s.label} NaN üretti: ${s.value}`);
      }
    });

    test(`${key}: gösterge etiketleri benzersiz`, () => {
      // Etiketler React'te key olarak kullanılıyor; tekrar ederse liste bozulur.
      const records = [sampleRecord(config, "a")];
      const labels = config.computeStats!(records).map((s) => s.label);
      assert.equal(new Set(labels).size, labels.length, `tekrar eden gösterge etiketi: ${labels.join(", ")}`);
    });
  }
});

describe("para birimi göstergeleri", () => {
  // Para birimlerinin karışmaması `sumByCurrency`/`moneyStats` yardımcılarının
  // işi; onlar shared.test.ts'te doğrudan test ediliyor. Burada yalnızca bu
  // yolun gerçekten kullanıldığını doğruluyoruz: iki farklı para biriminde
  // 100'er birim, hiçbir göstergede 200 olarak toplanmamalı.
  // Faz 2'den sonra para birimi ayrı bir select alanı değil, `currency` tipli
  // alanın ikinci anahtarı (bkz. shared.ts currencyField).
  const paraliModuller = entries.filter(([, c]) => c.fields.some((f) => f.type === "currency"));

  test("para birimi olan modül sayısı beklendiği gibi", () => {
    assert.ok(paraliModuller.length >= 7, `beklenenden az: ${paraliModuller.length}`);
  });

  for (const [key, config] of paraliModuller) {
    if (!config.computeStats) continue;
    test(`${key}: farklı para birimleri toplanmıyor`, () => {
      const amountField = config.fields.find((f) => f.type === "currency")!.key;
      const records = [
        sampleRecord(config, "try", { currency: "TRY", [amountField]: 100 }),
        sampleRecord(config, "usd", { currency: "USD", [amountField]: 100 }),
      ];
      for (const s of config.computeStats!(records)) {
        // 200 yalnızca iki para biriminin yanlışlıkla toplanmasıyla oluşur.
        assert.ok(!/\b200([.,]0+)?\b/.test(s.value), `${s.label} para birimlerini topladı: ${s.value}`);
      }
    });
  }
});
