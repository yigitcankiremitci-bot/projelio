import { kimlikVeYonConfig } from "./kimlikVeYon";
import type { ModuleFormConfig } from "./types";
import { urunStratejileriConfig } from "./urunStratejileri";

export * from "./types";

/**
 * A1 — Form / Doküman modülleri.
 *
 * Kayıt defteri (A2) ve türev panel (A6) gibi, bu da bir kayıt defteridir:
 * anahtarlar module_catalog.key ile birebir eşleşir. Bir modülü A1 yapmak için
 * buraya bir tanım eklemek yeterlidir; ekran yazılmaz.
 *
 * Bkz. docs/moduller/20-motor-a1-form.md
 */
export const MODULE_FORM_CONFIGS: Record<string, ModuleFormConfig> = {
  // YÖNETİM
  kimlik_ve_yon: kimlikVeYonConfig,

  // PAZARLAMA ve BÜYÜME
  pd_urun_stratejileri: urunStratejileriConfig,
};

export function isFormModule(moduleKey: string): boolean {
  return moduleKey in MODULE_FORM_CONFIGS;
}

export function getModuleFormConfig(moduleKey: string): ModuleFormConfig | undefined {
  return MODULE_FORM_CONFIGS[moduleKey];
}
