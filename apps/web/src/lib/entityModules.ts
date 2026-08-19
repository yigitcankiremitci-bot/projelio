/**
 * Ortak varlığa yazan modüller.
 *
 * Çoğu modül `module_records` tablosuna serbest şemayla yazar ve
 * ModuleRecordsPanel tarafından render edilir. Ama bazı modüller ortak bir
 * VARLIĞA bakar (müşteri → party, ürün → products); onların kendi tablosu ve
 * kendi paneli vardır.
 *
 * Ayrımın sebebi 1. ilke: varlık modülden bağımsızdır. İki departman aynı
 * müşteriyi görmeli, her biri kendi kopyasını tutmamalı.
 *
 * Bkz. docs/moduller/00-modul-mimarisi.md §3
 */
import { isFormModule } from "./moduleForms";
import { isPanelModule } from "./panelConfigs";
import { isSocialMediaModule } from "./socialMedia";

export const ENTITY_MODULE_KEYS = ["crm_musteri"] as const;

export type EntityModuleKey = (typeof ENTITY_MODULE_KEYS)[number];

export function isEntityModule(moduleKey: string): moduleKey is EntityModuleKey {
  return (ENTITY_MODULE_KEYS as readonly string[]).includes(moduleKey);
}

/**
 * Modül açılabilir mi.
 *
 * Beş yol var: ortak varlık paneli (party), türev panel (A6), form modülü (A1),
 * kendi tablosuna yazan özel panel (sosyal medya) ya da kayıt tanımı (A2).
 * Hiçbiri yoksa modül listede görünür ama tıklanamaz.
 */
export function isOpenableModule(moduleKey: string, hasRecordConfig: boolean): boolean {
  return (
    isEntityModule(moduleKey) ||
    isPanelModule(moduleKey) ||
    isFormModule(moduleKey) ||
    isSocialMediaModule(moduleKey) ||
    hasRecordConfig
  );
}
