import type { ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { api } from "../api/client";
import { MODULE_RECORD_CONFIGS } from "./moduleRecordConfigs";
import { isOpenableModule } from "./entityModules";

/**
 * Bir departmanda ETKİN modüller: departmanın katalog listesi ∩ şirkette açık
 * olanlar. Hem departman sayfasının modül şeridi (PageModulesBar) hem sidebar
 * ağacı buradan okur — kural iki yere kopyalanırsa biri bir gün "katalog dışı
 * departman" ya da "şirkette kapalı modül" ayrımını unutur.
 */
export async function departmanModulleriniYukle(
  organizationId: string,
  departmentKey: string | undefined
): Promise<ModuleCatalogEntry[]> {
  // Katalog dışı (özel) departmanın modülü yok.
  if (!departmentKey) return [];
  const [cat, org] = await Promise.all([
    api
      .get<ModuleCatalogEntry[]>(`/module-catalog?departmentKey=${encodeURIComponent(departmentKey)}`)
      .catch(() => []),
    api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
  ]);
  const etkin = new Set(org.map((m) => m.moduleKey));
  return cat.filter((e) => etkin.has(e.key));
}

/**
 * Departman modülünün açılacağı adres; açılamayan (henüz veri girişi olmayan
 * panel) modülde undefined. Departmanın modül paneli ?module= parametresini
 * zaten çözüyor: sayfa yüzeyliyi kendi adresine götürüyor, modal yüzeyliyi
 * yerinde açıyor (bkz. DepartmentModulesPanel).
 */
export function departmanModulAdresi(departmentId: string, moduleKey: string): string | undefined {
  if (!isOpenableModule(moduleKey, Boolean(MODULE_RECORD_CONFIGS[moduleKey]))) return undefined;
  return `/departments/${departmentId}?tab=modules&module=${encodeURIComponent(moduleKey)}`;
}
