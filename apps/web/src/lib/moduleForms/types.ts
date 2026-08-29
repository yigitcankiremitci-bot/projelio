import type { ModuleFieldConfig } from "../moduleConfigs";

/**
 * A1 — Form / Doküman arketipi.
 *
 * Ayırt edici kural: KAPSAM BAŞINA TEK KAYIT. Liste yok, "yeni" düğmesi yok;
 * ikinci kayıt oluşturulamaz. Geçmiş, kayıt çoğaltarak değil sürüm olarak
 * tutulur (module_record_versions).
 *
 * Bu yüzden A1, ModuleRecordConfig'i (liste motoru) yeniden kullanmıyor:
 * oradaki her kavram — addLabel, emptyLabel, summary, computeStats — bir
 * LİSTEYİ tarif ediyor. Ortak olan tek şey alan tanımı (ModuleFieldConfig),
 * o da paylaşılıyor.
 *
 * Bkz. docs/moduller/20-motor-a1-form.md
 */

/** Alan hangi bölümde görünecek + onay için zorunlu mu. */
export interface ModuleFormFieldConfig extends ModuleFieldConfig {
  /** ModuleFormConfig.groups içindeki bir key. */
  group: string;
  /**
   * Taslak kaydetmek için değil, ONAYLAMAK için zorunlu.
   * Yarım bırakılmış bir metin kaydedilebilmeli; yayımlanmamalı.
   */
  requiredForApproval?: boolean;
  /** Alanın altında görünen açıklama. */
  help?: string;
}

export interface ModuleFormGroup {
  key: string;
  label: string;
  /** Bölüm başlığının altındaki tek cümlelik yönlendirme. */
  hint?: string;
}

export interface ModuleFormTemplate {
  key: string;
  label: string;
  /** Şablon daima TASLAK olarak yüklenir — gerçek metin sanılmasın. */
  data: Record<string, unknown>;
}

export interface ModuleFormConfig {
  kind: "form";
  title: string;

  /**
   * Tek kayıt neye göre tekil.
   *   organization — şirketin (ya da serbest çalışanın işinin) tek kaydı
   *   entity       — bir varlık başına bir kayıt (ör. her ürün için bir strateji)
   */
  scope: "organization" | "entity";
  /** scope === "entity" ise hangi varlık. */
  scopeEntity?: "product";
  /** scope === "entity" ise kapsamı taşıyan alanın anahtarı. */
  scopeFieldKey?: string;

  groups: ModuleFormGroup[];
  fields: ModuleFormFieldConfig[];

  /** Gözden geçirme aralığı (ay). Verilirse onay anında review_at hesaplanır. */
  reviewIntervalMonths?: number;

  templates?: ModuleFormTemplate[];

  /** Kayıt hiç yokken gösterilecek metinler. */
  empty: {
    title: string;
    body: string;
    action: string;
  };
}

/** Onay için eksik olan alanların etiketleri. Boş dizi = onaylanabilir. */
export function missingForApproval(
  config: ModuleFormConfig,
  data: Record<string, unknown>
): string[] {
  return config.fields
    .filter((f) => f.requiredForApproval)
    .filter((f) => {
      const v = data[f.key];
      if (Array.isArray(v)) return v.length === 0;
      return v === undefined || v === null || String(v).trim() === "";
    })
    .map((f) => f.label);
}

/**
 * Yürürlükteki metin ile taslak arasında değişen alanların etiketleri.
 * Sürüm listesindeki "neler değişti" satırı ve "onaylanmamış değişiklik var"
 * uyarısı bunu kullanır.
 */
export function changedFields(
  config: ModuleFormConfig,
  current: Record<string, unknown>,
  draft: Record<string, unknown> | null | undefined
): string[] {
  if (!draft) return [];
  return config.fields
    .filter((f) => JSON.stringify(current[f.key] ?? null) !== JSON.stringify(draft[f.key] ?? null))
    .map((f) => f.label);
}
