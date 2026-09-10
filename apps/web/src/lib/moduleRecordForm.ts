import type { ModuleRecord } from "@projelio/shared";
import type { ModuleFieldConfig } from "./moduleConfigs";

/**
 * Modül kayıt formunun dönüşümleri: alan tanımı → form state → sunucuya giden
 * `data`.
 *
 * Eskiden ModuleRecordsPanel'in içindeydi. AddModuleRecordModal aynı formu
 * kendi elleriyle kuruyordu ve kopyada para birimi (currency) alanı eksikti:
 * tutar sayı yerine METİN olarak kaydediliyor, para birimi hiç yazılmıyordu.
 * Modal artık kayıt DÜZENLEYEBİLDİĞİ için ikinci bir kopya tutmak aynı hatayı
 * bu kez düzenleme yolunda tekrar ederdi — tek kaynak burası.
 */

export function emptyForm(fields: ModuleFieldConfig[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (const field of fields) {
    f[field.key] = field.defaultValue ?? "";
    // currency alanı iki anahtar yönetir; para biriminin de varsayılanı olmalı.
    if (field.type === "currency") f[field.currencyKey ?? "currency"] = "TRY";
  }
  return f;
}

export function formFromRecord(fields: ModuleFieldConfig[], record: ModuleRecord): Record<string, string> {
  const f: Record<string, string> = {};
  const read = (key: string) => {
    const v = record.data[key];
    return v === undefined || v === null ? "" : String(v);
  };
  for (const field of fields) {
    f[field.key] = read(field.key);
    // Para birimi ayrı anahtarda duruyor; yüklenmezse düzenlemede TRY'ye
    // sıfırlanır ve kullanıcı farkında olmadan tutarın birimini değiştirir.
    if (field.type === "currency") {
      const ck = field.currencyKey ?? "currency";
      f[ck] = read(ck) || "TRY";
    }
  }
  return f;
}

export function formToData(fields: ModuleFieldConfig[], form: Record<string, string>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    // Hesaplanan alanlar kaydedilmez; her okumada yeniden üretilir, aksi
    // halde kaynak alan değişince bayat bir değer kalırdı.
    if (field.type === "formula") continue;
    const v = form[field.key];
    if (v === undefined || v === "") continue;
    data[field.key] = field.type === "number" || field.type === "currency" ? Number(v) : v;
  }
  // currency alanı para birimini ayrı anahtara yazar (bkz. shared.ts currencyField).
  for (const field of fields) {
    if (field.type !== "currency") continue;
    const ck = field.currencyKey ?? "currency";
    if (form[ck]) data[ck] = form[ck];
  }
  return data;
}
