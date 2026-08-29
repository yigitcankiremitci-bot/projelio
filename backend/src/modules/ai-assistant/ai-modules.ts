import { BadRequestException } from "@nestjs/common";
import {
  CURRENCY_OPTIONS,
  getModuleRecordConfig,
  MODULE_RECORD_CONFIGS,
  type ModuleFieldConfig,
} from "@projelio/shared";

// Lio'nun modül kayıtlarıyla çalışabilmesi için alan tanımlarının backend'de de
// okunabilmesi gerekiyor. Tanımlar packages/shared/src/moduleConfigs/ altında —
// eskiden yalnızca web'deydi, tek kaynak olsun diye taşındı.
//
// Buradaki iki iş:
//   describeModuleFields — modele alanları anlatır (create/update öncesi)
//   normalizeModuleData  — modelin yazdığını süzer ve doğrular
//
// Doğrulama şart: model alan adını uydurursa kayıt sessizce boş görünür.
// Panel yalnızca tanımdaki anahtarları render ediyor, fazlası ekranda çıkmaz.

/** Bir modülün kayıt tanımı var mı (yoksa ortak varlık/panel modülüdür). */
export function hasRecordConfig(moduleKey: string): boolean {
  return moduleKey in MODULE_RECORD_CONFIGS;
}

function fieldCurrencyKey(field: ModuleFieldConfig): string {
  return field.currencyKey ?? "currency";
}

/**
 * Modelin göreceği alan tarifi.
 *
 * Etiketler Türkçe bırakılıyor: kullanıcı "kategoriyi Kira yap" dediğinde model
 * etiketten anahtara kendi eşliyor. Seçenekler "value (Etiket)" biçiminde tek
 * satıra sıkıştırılıyor — her modül tarifi her turda token olarak ödeniyor.
 */
export function describeModuleFields(moduleKey: string, moduleName: string) {
  const config = getModuleRecordConfig(moduleKey, moduleName);
  const fields = config.fields.map((f) => {
    const out: Record<string, unknown> = { key: f.key, label: f.label, type: f.type };
    if (f.required) out.required = true;
    if (f.defaultValue !== undefined) out.default = f.defaultValue;
    if (f.options?.length) out.options = f.options.map((o) => `${o.value} (${o.label})`).join(", ");
    switch (f.type) {
      case "currency":
        // Tek alan iki anahtara yazar: tutar kendi anahtarına, para birimi ayrı.
        out.note =
          `Tutarı sayı olarak "${f.key}", para birimini "${fieldCurrencyKey(f)}" anahtarına yaz ` +
          `(${CURRENCY_OPTIONS.map((o) => o.value).join("/")}; varsayılan TRY).`;
        break;
      case "multiselect":
      case "tags":
        // Dizi DEĞİL: panel virgülle ayrılmış tek metin bekliyor.
        out.note = "Virgülle ayrılmış tek metin olarak yaz (ör. \"a,b\"). Dizi gönderme.";
        break;
      case "date":
        out.note = "YYYY-MM-DD biçiminde yaz.";
        break;
      case "entity_ref":
        out.note = "Ortak varlık (müşteri/tedarikçi) referansı. Kimliği yoksa düz ad yazabilirsin.";
        break;
      case "user_ref":
        out.note = "Organizasyon üyesi referansı. Kimliği yoksa düz ad yazabilirsin.";
        break;
      case "formula":
        out.note = "SALT OKUNUR — hesaplanır, yazma.";
        break;
    }
    return out;
  });
  return { moduleKey, title: config.title, fields };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function coerceValue(field: ModuleFieldConfig, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return undefined;

  switch (field.type) {
    case "number":
    case "currency": {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        throw new BadRequestException(`"${field.label}" alanı sayı olmalı, gelen: ${JSON.stringify(raw)}`);
      }
      return n;
    }
    case "date": {
      const s = String(raw).slice(0, 10);
      if (!DATE_RE.test(s)) {
        throw new BadRequestException(`"${field.label}" alanı YYYY-MM-DD biçiminde olmalı, gelen: ${JSON.stringify(raw)}`);
      }
      return s;
    }
    case "select": {
      const s = String(raw);
      const allowed = field.options ?? [];
      if (allowed.length && !allowed.some((o) => o.value === s)) {
        throw new BadRequestException(
          `"${field.label}" için geçersiz değer: ${s}. Geçerli seçenekler: ${allowed.map((o) => o.value).join(", ")}`
        );
      }
      return s;
    }
    case "multiselect":
    case "tags": {
      // Model dizi de gönderebilir, virgüllü metin de; saklama biçimi tek: metin.
      const parts = (Array.isArray(raw) ? raw.map(String) : String(raw).split(","))
        .map((p) => p.trim())
        .filter(Boolean);
      if (field.type === "multiselect" && field.options?.length) {
        const allowed = new Set(field.options.map((o) => o.value));
        const bad = parts.filter((p) => !allowed.has(p));
        if (bad.length) {
          throw new BadRequestException(
            `"${field.label}" için geçersiz değer(ler): ${bad.join(", ")}. ` +
              `Geçerli seçenekler: ${field.options.map((o) => o.value).join(", ")}`
          );
        }
      }
      return parts.join(",");
    }
    default:
      return String(raw);
  }
}

/**
 * Modelin verdiği ham veriyi modülün alan tanımına göre süzer.
 *
 * Tanımda olmayan anahtarlar ATILIR (sessizce değil — warnings'te bildirilir):
 * panel yalnızca tanımdaki anahtarları gösterdiği için, uydurulmuş bir alan
 * kaydı "boş" gibi gösterirdi. Hesaplanan (formula) alanlar da atılır.
 */
export function normalizeModuleData(
  moduleKey: string,
  moduleName: string,
  input: Record<string, unknown> | undefined,
  opts: { requireMandatory?: boolean } = {}
): { data: Record<string, unknown>; warnings: string[] } {
  const config = getModuleRecordConfig(moduleKey, moduleName);
  const byKey = new Map(config.fields.map((f) => [f.key, f]));
  // Tutar alanlarının para birimi anahtarları alan listesinde görünmez ama geçerlidir.
  const currencyKeys = new Map(
    config.fields.filter((f) => f.type === "currency").map((f) => [fieldCurrencyKey(f), f])
  );

  const data: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const [key, raw] of Object.entries(input ?? {})) {
    const field = byKey.get(key);
    if (field) {
      if (field.type === "formula") {
        warnings.push(`"${key}" hesaplanan bir alan, yok sayıldı.`);
        continue;
      }
      const value = coerceValue(field, raw);
      if (value !== undefined) data[key] = value;
      continue;
    }
    if (currencyKeys.has(key)) {
      const code = String(raw).toUpperCase();
      if (!CURRENCY_OPTIONS.some((o) => o.value === code)) {
        throw new BadRequestException(
          `Geçersiz para birimi: ${raw}. Geçerli: ${CURRENCY_OPTIONS.map((o) => o.value).join(", ")}`
        );
      }
      data[key] = code;
      continue;
    }
    warnings.push(`"${key}" bu modülde tanımlı bir alan değil, yok sayıldı.`);
  }

  if (opts.requireMandatory) {
    const missing = config.fields
      .filter((f) => f.required && data[f.key] === undefined && f.defaultValue === undefined)
      .map((f) => `${f.key} (${f.label})`);
    if (missing.length) {
      throw new BadRequestException(`Zorunlu alan(lar) eksik: ${missing.join(", ")}`);
    }
    // Varsayılanı olan zorunlu alanlar boş bırakılabilir; panelin davranışıyla aynı.
    for (const f of config.fields) {
      if (f.defaultValue !== undefined && data[f.key] === undefined) data[f.key] = f.defaultValue;
    }
  }

  return { data, warnings };
}
