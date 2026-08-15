import { isEntityModule } from "./entityModules";
import { isFormModule } from "./moduleForms";
import { MODULE_RECORD_CONFIGS } from "./moduleConfigs";
import { isPanelModule } from "./panelConfigs";

/**
 * Modül yüzeyi: modül açılınca ekranı nasıl kaplıyor.
 *
 * Bu, modülün NE YAPTIĞINDAN (arketip) ayrı bir karardır ve modül tanımında
 * sabittir — kullanım verisine göre değişmez. Nereden AÇILDIĞI ise otomatiktir,
 * bkz. moduleLayout.ts.
 *
 * Ölçüt tek cümleyle: iş tek ekranda bitiyorsa modal, ekranın kendisi bir
 * çalışma alanıysa sayfa.
 *
 * Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §2
 */

export type ModuleSurface = "modal" | "page";

export type ModuleArchetype =
  | "a1_form"
  | "a2_records"
  | "a3_inventory"
  | "a4_pipeline"
  | "a5_plan"
  | "a6_panel"
  | "entity"
  | "unknown";

/** Motorları henüz yazılmamış arketiplerin modülleri (bkz. docs 21/22/23). */
const A4_PIPELINE_KEYS = new Set([
  "spd_satis_planlama_b2b_b2c",
  "ik_ise_alim_oryantasyon",
  "mid_sikayet_oneri",
  "mid_teknik_destek",
  "talep_yonetimi",
  "oud_tedarik",
  "oud_sevkiyat_yonetimi",
  "oud_kalite_kontrol",
]);

const A5_PLAN_KEYS = new Set([
  "pd_sosyal_medya",
  "pd_email",
  "icerik_takvimi",
  "pd_reklam",
  "ik_egitim_gelisim",
  "fm_vergi_takip",
]);

const A3_INVENTORY_KEYS = new Set(["oud_depo"]);

/**
 * Modülün arketipi.
 *
 * Sıra önemli: bir modül birden fazla kayıt defterinde görünmemeli, ama göç
 * dönemlerinde (ör. A4 modülleri hâlâ A2 tanımıyla çalışırken) görünebilir.
 * Böyle bir durumda HEDEF arketip kazanır — yüzey kararı, motor geldiğinde
 * değişmemeli.
 */
export function moduleArchetype(moduleKey: string): ModuleArchetype {
  if (isFormModule(moduleKey)) return "a1_form";
  if (A3_INVENTORY_KEYS.has(moduleKey)) return "a3_inventory";
  if (A4_PIPELINE_KEYS.has(moduleKey)) return "a4_pipeline";
  if (A5_PLAN_KEYS.has(moduleKey)) return "a5_plan";
  if (isPanelModule(moduleKey)) return "a6_panel";
  if (isEntityModule(moduleKey)) return "entity";
  if (MODULE_RECORD_CONFIGS[moduleKey]) return "a2_records";
  return "unknown";
}

const ARCHETYPE_SURFACE: Record<ModuleArchetype, ModuleSurface> = {
  a1_form: "modal", // tek kayıt: okuma + düzenleme
  a2_records: "page", // filtre / arama / toplu işlem
  a3_inventory: "page", // iki seviyeli: kalem → hareket
  a4_pipeline: "page", // kanban yatayda yer ister
  a5_plan: "page", // ay ızgarası modala sığmaz
  a6_panel: "page", // kart ızgarası + kırılım
  entity: "page", // müşteri listesi
  // Tanımı olmayan modül bugün zaten açılmıyor; açılırsa en ucuz yüzey doğrusu.
  unknown: "modal",
};

/**
 * Arketip varsayılanından sapan modüller.
 *
 * Her satırın gerekçesi olmalı. Bu liste 10'u geçerse ölçüt yanlıştır — tek tek
 * modül kararı vermek yerine ölçüt düzeltilir.
 */
const SURFACE_OVERRIDES: Record<string, ModuleSurface> = {
  // Dönem başına 3–7 hedef; filtreye gerek yok.
  yonetim_hedef_belirleme: "modal",
  hedef_yonetimi: "modal",
  // Referans kütüphane: salt okunur ağırlıklı, kısa liste.
  hud_mevzuatlar: "modal",
  // Periyodik kontrol listesi; kayıt sayısı düşük kalıyor.
  bt_ag_guvenlik: "modal",
  // 3–5 persona kartı.
  pd_hedef_kitle: "modal",
  // Tek bir sağlık listesi; grafik taşımıyor.
  yonetim_denetim: "modal",
  holding_denetim: "modal",
};

export function moduleSurface(moduleKey: string): ModuleSurface {
  return SURFACE_OVERRIDES[moduleKey] ?? ARCHETYPE_SURFACE[moduleArchetype(moduleKey)];
}

/**
 * Modal genişliği.
 *
 * Bugünkü Modal varsayılanı 400px — form modülleri için dar, uzun metin iki
 * kelimede bir kırılıyor. Liste/panel taşıyan modaller daha da geniş olmalı.
 */
export function moduleModalWidth(moduleKey: string): number {
  return moduleArchetype(moduleKey) === "a1_form" ? 640 : 760;
}
