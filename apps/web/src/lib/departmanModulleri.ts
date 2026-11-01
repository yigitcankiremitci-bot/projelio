import type { Department, ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { MUAF_DEPARTMAN_ANAHTARI } from "@projelio/shared";
import { api } from "../api/client";
import { MODULE_RECORD_CONFIGS } from "./moduleRecordConfigs";
import { isOpenableModule } from "./entityModules";
import { departmaninKatalogu } from "./modulYeri";

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
    departmanKatalogunuYukle(organizationId, departmentKey),
    api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
  ]);
  const etkin = new Set(org.map((m) => m.moduleKey));
  return cat.filter((e) => etkin.has(e.key));
}

/**
 * Departmanın modül KATALOĞU (etkin olsun olmasın). Yönetim'inki şirketin
 * hangi departmanları açtığına bağlı — departmanı açılmamış modüller de
 * Yönetim'de (bkz. lib/modulYeri.ts) — bu yüzden tam katalog ve departmanlar
 * birlikte okunur.
 */
export async function departmanKatalogunuYukle(
  organizationId: string,
  departmentKey: string | undefined
): Promise<ModuleCatalogEntry[]> {
  if (!departmentKey) return [];
  if (departmentKey !== MUAF_DEPARTMAN_ANAHTARI) {
    return api
      .get<ModuleCatalogEntry[]>(`/module-catalog?departmentKey=${encodeURIComponent(departmentKey)}`)
      .catch(() => []);
  }
  const [cat, depts] = await Promise.all([
    api.get<ModuleCatalogEntry[]>("/module-catalog").catch(() => []),
    api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []),
  ]);
  return departmaninKatalogu(cat, departmentKey, depts);
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
