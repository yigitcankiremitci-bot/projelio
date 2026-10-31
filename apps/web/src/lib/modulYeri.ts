import type { ModuleCatalogEntry } from "@projelio/shared";
import { isCekirdekModul } from "./cekirdekModuller";

/**
 * Şirketteki bir modülün "evi": ilgili departmanı açıksa o departman, değilse
 * yönetici (şirket sahibi).
 *
 * Eskiden bir modüle yalnızca departmanın altından girilebiliyordu. Kurulumda
 * her modül için departman açılması bundan doğuyordu: 2-3 kişilik bir işletme
 * Faturalar'ı kullanmak için kimsesi olmayan bir Finans departmanı kuruyordu.
 * Artık departmanı açılmamış modül yöneticide durur; departman sonradan
 * açılınca kayıtlar kendiliğinden o departmanın üyelerine de görünür (sunucu
 * yetkiyi katalogdaki departman anahtarından çözüyor, bkz.
 * ModuleMembersService.departmentsWithModule).
 */

type Departman = { id: string; catalogKey?: string | null };

function departmanAnahtarlari(entry: Pick<ModuleCatalogEntry, "departmentKey" | "departmentKeys">): string[] {
  if (entry.departmentKeys?.length) return entry.departmentKeys;
  return entry.departmentKey ? [entry.departmentKey] : [];
}

/**
 * Modülün açıldığı departman; şirkette ilgili departmanlardan hiçbiri yoksa
 * undefined. Liste birincil departman başta geldiği için kurulu olan ilk
 * departman kazanır.
 */
export function modulDepartmani(
  entry: Pick<ModuleCatalogEntry, "departmentKey" | "departmentKeys">,
  departments: Departman[]
): string | undefined {
  const idByKey = new Map(departments.filter((d) => d.catalogKey).map((d) => [d.catalogKey as string, d.id]));
  for (const key of departmanAnahtarlari(entry)) {
    const id = idByKey.get(key);
    if (id) return id;
  }
  return undefined;
}

/** Şirket düzeyindeki (yöneticideki) modül sayfası. */
export function yoneticiModulAdresi(organizationId: string, moduleKey: string): string {
  return `/organizations/${organizationId}/modules/${encodeURIComponent(moduleKey)}`;
}

/**
 * "Modül ekle"de Yönetici seçeneğinin listesi: ilgili departmanı şirkette
 * AÇIK OLMAYAN modüller. Departmanı açık olan modül o departmandan eklenir —
 * aynı modülün iki evi olmasın.
 *
 * Holding modülleri şirkette eklenmez; çekirdek modüllerin (proje, görev,
 * dosya…) verisi bir departmanın ya da işin sekmesinde yaşadığı için
 * yöneticide açılacak bir yüzeyleri yok.
 */
export function yoneticiyeEklenebilir(entry: ModuleCatalogEntry, departments: Departman[]): boolean {
  if (entry.scope === "holding") return false;
  if (isCekirdekModul(entry.key)) return false;
  return modulDepartmani(entry, departments) === undefined;
}
