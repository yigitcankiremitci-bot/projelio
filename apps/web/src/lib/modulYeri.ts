import type { ModuleCatalogEntry } from "@projelio/shared";
import { departmaniAcik, modulunEvi, MUAF_DEPARTMAN_ANAHTARI } from "@projelio/shared";
import { isCekirdekModul } from "./cekirdekModuller";

/**
 * Şirketteki bir modülün "evi": ilgili departmanı açıksa o departman, değilse
 * Yönetim departmanı (kural shared modulEvi.ts'te, sunucuyla ortak).
 *
 * Eskiden bir modüle yalnızca kendi departmanının altından girilebiliyordu.
 * Kurulumda her modül için departman açılması bundan doğuyordu: 2-3 kişilik
 * bir işletme Faturalar'ı kullanmak için kimsesi olmayan bir Finans departmanı
 * kuruyordu. Arada bir süre "yönetici (departmansız)" diye ayrı bir yer vardı;
 * departman seçicisinde kafa karıştırdığı için Yönetim'e bağlandı.
 */

type Departman = { id: string; catalogKey?: string | null };

function departmanAnahtarlari(entry: Pick<ModuleCatalogEntry, "departmentKey" | "departmentKeys">): string[] {
  if (entry.departmentKeys?.length) return entry.departmentKeys;
  return entry.departmentKey ? [entry.departmentKey] : [];
}

/**
 * Modülün evi olan departman; şirkette ne ilgili departman ne Yönetim varsa
 * undefined. Liste birincil departman başta geldiği için kurulu olan ilk
 * departman kazanır.
 */
export function modulDepartmani(
  entry: Pick<ModuleCatalogEntry, "departmentKey" | "departmentKeys">,
  departments: Departman[]
): string | undefined {
  return modulunEvi(departmanAnahtarlari(entry), departments);
}

/** Şirket düzeyindeki modül sayfası — Yönetim'i olmayan şirket için yedek. */
export function yoneticiModulAdresi(organizationId: string, moduleKey: string): string {
  return `/organizations/${organizationId}/modules/${encodeURIComponent(moduleKey)}`;
}

/**
 * Yönetim'e düşen modül: ilgili departmanı şirkette AÇIK OLMAYAN şirket
 * modülü. Departmanı açık olan modül o departmandan eklenir — aynı modülün
 * iki evi olmasın.
 *
 * Holding modülleri şirkette eklenmez; çekirdek modüllerin (proje, görev,
 * dosya…) verisi bir departmanın ya da işin sekmesinde yaşadığı için ayrıca
 * açılacak bir yüzeyleri yok.
 */
export function yonetimeDuser(entry: ModuleCatalogEntry, departments: Departman[]): boolean {
  if (entry.scope === "holding") return false;
  if (isCekirdekModul(entry.key)) return false;
  return !departmaniAcik(departmanAnahtarlari(entry), departments);
}

/**
 * Bir departmanın modül kataloğu (tam katalogdan süzülür): kendi modülleri;
 * Yönetim'se bunlara ek olarak departmanı açılmamış bütün modüller.
 */
export function departmaninKatalogu(
  katalog: ModuleCatalogEntry[],
  departmentKey: string | null | undefined,
  departments: Departman[]
): ModuleCatalogEntry[] {
  if (!departmentKey) return [];
  return katalog.filter(
    (e) =>
      departmanAnahtarlari(e).includes(departmentKey) ||
      (departmentKey === MUAF_DEPARTMAN_ANAHTARI && yonetimeDuser(e, departments))
  );
}
