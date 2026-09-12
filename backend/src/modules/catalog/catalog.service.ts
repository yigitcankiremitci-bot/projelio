import { Injectable } from "@nestjs/common";
import type { DepartmentCatalogEntry, ModuleCatalogEntry } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapDepartmentCatalog(row: any): DepartmentCatalogEntry {
  return {
    key: row.key,
    name: row.name,
    description: row.description ?? undefined,
    mainTaskAreas: row.main_task_areas ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapModuleCatalog(row: any, departmentKeys?: string[]): ModuleCatalogEntry {
  return {
    key: row.key,
    departmentKey: row.department_key ?? undefined,
    departmentKeys: departmentKeys?.length ? departmentKeys : undefined,
    name: row.name,
    description: row.description ?? undefined,
    scope: row.scope,
    appliesToFreelancer: row.applies_to_freelancer ?? false,
    sortOrder: row.sort_order ?? 0,
  };
}

// Departman ve modül katalogları sabit/referans veridir (kurulum sihirbazı ve
// "Modüller" sekmesi bunlardan okur) — bu servis salt okunur.
@Injectable()
export class CatalogService {
  constructor(private supabase: SupabaseService) {}

  async findDepartments(): Promise<DepartmentCatalogEntry[]> {
    const { data, error } = await this.supabase.client
      .from("department_catalog")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapDepartmentCatalog);
  }

  /**
   * Bir departmanın modülleri.
   *
   * Departman eşlemesi artık module_catalog.department_key'de değil,
   * module_catalog_departments'ta: bir modül birden fazla departmana açılabilir
   * (ör. Müşteri modülü hem Satış hem Müşteri İlişkileri'nde). Tekil kolon
   * geriye dönük uyumluluk için duruyor ve birincil departmanı gösteriyor.
   * Bkz. 046_party_and_customer_merge.sql
   */
  async findModules(opts: { departmentKey?: string; freelancerOnly?: boolean } = {}): Promise<ModuleCatalogEntry[]> {
    let keysForDepartment: string[] | null = null;
    if (opts.departmentKey) {
      const { data: mapping, error: mappingError } = await this.supabase.client
        .from("module_catalog_departments")
        .select("module_key")
        .eq("department_key", opts.departmentKey);
      if (mappingError) throw mappingError;
      keysForDepartment = (mapping ?? []).map((r: any) => r.module_key);
      // Eşleme yoksa boş dönmek doğru: o departmana atanmış modül yok demektir.
      if (keysForDepartment.length === 0) return [];
    }

    let query = this.supabase.client.from("module_catalog").select("*").order("sort_order", { ascending: true });
    if (keysForDepartment) query = query.in("key", keysForDepartment);
    if (opts.freelancerOnly) query = query.eq("applies_to_freelancer", true);
    const { data, error } = await query;
    if (error) throw error;

    // Her modülün TÜM departmanları, birincil olan başta. Şirket sayfasındaki
    // modül kartı tek bir departman anahtarıyla yetinemiyor: modül, birincil
    // departmanı kurulmamış bir şirkette de açık olabiliyor ve kart o zaman
    // gidecek yer bulamıyordu (bkz. apps/web ModulesPanel).
    const byModule = await this.departmentKeysByModule();
    return (data ?? []).map((row: any) => mapModuleCatalog(row, byModule.get(row.key)));
  }

  /** module_catalog_departments'ı modül anahtarına göre toplar. */
  private async departmentKeysByModule(): Promise<Map<string, string[]>> {
    const { data, error } = await this.supabase.client
      .from("module_catalog_departments")
      .select("module_key, department_key, is_primary, sort_order")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });
    // Eşleme tablosu okunamazsa katalog yine dönmeli: kart tıklanamaz kalır ama
    // liste kaybolmaz.
    if (error) return new Map();
    const map = new Map<string, string[]>();
    for (const row of data ?? []) {
      const list = map.get(row.module_key) ?? [];
      list.push(row.department_key);
      map.set(row.module_key, list);
    }
    return map;
  }
}
