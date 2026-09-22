import { BadRequestException } from "@nestjs/common";
import {
  CURRENCY_OPTIONS,
  getModuleRecordConfig,
  isReferenceValue,
  MODULE_RECORD_CONFIGS,
  type ModuleFieldConfig,
} from "@projelio/shared";
import { hataMetni } from "../../common/i18n/index";
import { normalizeName } from "../party/party-dedup";

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
        out.note =
          "Müşteri/tedarikçi kartına bağlanır. Kartın adını ya da partyId'sini yaz; ad kayıtlı bir kartla " +
          "eşleşirse sistem karta bağlar. Kart yoksa ad düz metin kalır ve uyarı döner.";
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
        throw new BadRequestException(hataMetni("\"{label}\" alanı sayı olmalı, gelen: {p2}", { label: field.label, p2: JSON.stringify(raw) }));
      }
      return n;
    }
    case "date": {
      const s = String(raw).slice(0, 10);
      if (!DATE_RE.test(s)) {
        throw new BadRequestException(hataMetni("\"{label}\" alanı YYYY-MM-DD biçiminde olmalı, gelen: {p2}", { label: field.label, p2: JSON.stringify(raw) }));
      }
      return s;
    }
    case "select": {
      const s = String(raw);
      const allowed = field.options ?? [];
      if (allowed.length && !allowed.some((o) => o.value === s)) {
        throw new BadRequestException(
          hataMetni("\"{label}\" için geçersiz değer: {s}. Geçerli seçenekler: {p3}", { label: field.label, s, p3: allowed.map((o) => o.value).join(", ") })
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
          hataMetni("Geçersiz para birimi: {raw}. Geçerli: {p2}", { raw: String(raw), p2: CURRENCY_OPTIONS.map((o) => o.value).join(", ") })
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
      throw new BadRequestException(hataMetni("Zorunlu alan(lar) eksik: {p1}", { p1: missing.join(", ") }));
    }
    // Varsayılanı olan zorunlu alanlar boş bırakılabilir; panelin davranışıyla aynı.
    for (const f of config.fields) {
      if (f.defaultValue !== undefined && data[f.key] === undefined) data[f.key] = f.defaultValue;
    }
  }

  return { data, warnings };
}

/** Eşleştirme için gereken kadarı — Party'nin tamamı değil, test kolay kurulsun. */
export interface PartyCandidate {
  id: string;
  displayName: string;
  legalName?: string;
}

/** Modülün müşteri kartına bağlanan alanları (entity_ref + party). */
export function partyFieldKeys(moduleKey: string, moduleName: string): string[] {
  return getModuleRecordConfig(moduleKey, moduleName)
    .fields.filter((f) => f.type === "entity_ref" && (f.entity ?? "party") === "party")
    .map((f) => f.key);
}

/**
 * Müşteri alanına yazılan ADI kayıtlı karta bağlar (değer kartın kimliği olur).
 *
 * Arayüz bu alanlara kartın kimliğini yazıyor; Lio ise kullanıcının söylediği
 * adı yazıyordu. Düz ad ekranda doğru görünür ama karta bağlı değildir: kart
 * yeniden adlandırılınca eskide kalır, Kasa'daki karşı taraf çözümlemesi de onu
 * tanımaz. Eşleşme party-dedup'ın normalleştirmesiyle yapılıyor ("ABC Ltd. Şti."
 * ~ "abc") — yinelenen kart uyarısının kullandığı kuralın aynısı.
 *
 * Belirsizlikte BAĞLAMAZ: iki kart aynı ada düşerse yanlış müşteriye alacak
 * yazmak, bağlamamaktan çok daha kötü. Ad olduğu gibi kalır, adaylar uyarıda
 * döner; model kullanıcıya sorup partyId ile günceller.
 *
 * Kimlik verilmişse kapsamdaki kartlardan biri OLMAK ZORUNDA: başka bir
 * şirketin kartına bağlanmış kayıt ekranda "(silinmiş kayıt)" görünürdü.
 */
export function linkPartyReferences(
  keys: string[],
  data: Record<string, unknown>,
  parties: PartyCandidate[]
): { data: Record<string, unknown>; warnings: string[] } {
  const out = { ...data };
  const warnings: string[] = [];
  for (const key of keys) {
    const value = out[key];
    if (typeof value !== "string" || !value.trim()) continue;

    if (isReferenceValue(value)) {
      if (!parties.some((p) => p.id === value)) {
        throw new BadRequestException(
          hataMetni("\"{key}\" alanındaki müşteri kartı ({value}) bu şirkette bulunamadı.", { key, value })
        );
      }
      continue;
    }

    const aranan = normalizeName(value);
    const eslesen = aranan
      ? parties.filter(
          (p) => normalizeName(p.displayName) === aranan || (p.legalName && normalizeName(p.legalName) === aranan)
        )
      : [];
    if (eslesen.length === 1) {
      out[key] = eslesen[0].id;
    } else if (eslesen.length > 1) {
      warnings.push(
        `"${value}" birden fazla müşteri kartıyla eşleşti, karta BAĞLANMADI: ` +
          eslesen.map((p) => `${p.displayName} (${p.id})`).join(", ") +
          ". Kullanıcıya hangisi olduğunu sor, update_module_record ile partyId'yi yaz."
      );
    } else {
      warnings.push(
        `"${value}" adında müşteri kartı yok; düz ad olarak yazıldı. Kullanıcı isterse create_customer ile ` +
          "kart açıp update_module_record ile kaydı karta bağla."
      );
    }
  }
  return { data: out, warnings };
}
