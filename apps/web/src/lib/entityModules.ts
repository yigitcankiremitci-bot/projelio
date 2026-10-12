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
import { isHesaplarModule } from "./hesaplar";
import { isEkipHesaplariModule } from "./ekipHesaplari";
import { isCekirdekModul } from "./cekirdekModuller";

// baglantilar: aynı party tablosu, ayrı defter (migration 153).
export const ENTITY_MODULE_KEYS = ["crm_musteri", "baglantilar"] as const;

export type EntityModuleKey = (typeof ENTITY_MODULE_KEYS)[number];

export function isEntityModule(moduleKey: string): moduleKey is EntityModuleKey {
  return (ENTITY_MODULE_KEYS as readonly string[]).includes(moduleKey);
}

// Ürünler modülü ortak `products` tablosuna bakar; paneli ProductsPanel
// (anasayfadaki ve Ürün/Hizmet sekmesindekiyle aynı).
export const URUNLER_MODUL_KEY = "uyd_urunler";

export function isUrunlerModule(moduleKey: string): boolean {
  return moduleKey === URUNLER_MODUL_KEY;
}

/**
 * Modül açılabilir mi.
 *
 * Yollar: ortak varlık paneli (party, ürünler), türev panel (A6), form modülü
 * (A1), kendi tablosuna yazan özel panel (sosyal medya, hesaplar), kayıt tanımı
 * (A2) ya da çekirdek sekmeye yönlendirme (bkz. cekirdekModuller.ts).
 * Hiçbiri yoksa modül listede görünür ama tıklanamaz — kullanıcı bunu bozukluk
 * sanıyor, yeni modül eklerken buraya bir yol vermeyi unutma.
 */
export function isOpenableModule(moduleKey: string, hasRecordConfig: boolean): boolean {
  return (
    isEntityModule(moduleKey) ||
    isUrunlerModule(moduleKey) ||
    isCekirdekModul(moduleKey) ||
    isPanelModule(moduleKey) ||
    isFormModule(moduleKey) ||
    isSocialMediaModule(moduleKey) ||
    isHesaplarModule(moduleKey) ||
    isEkipHesaplariModule(moduleKey) ||
    hasRecordConfig
  );
}
