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

function mapModuleCatalog(row: any): ModuleCatalogEntry {
  return {
    key: row.key,
    departmentKey: row.department_key ?? undefined,
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

  async findModules(opts: { departmentKey?: string; freelancerOnly?: boolean } = {}): Promise<ModuleCatalogEntry[]> {
    let query = this.supabase.client.from("module_catalog").select("*").order("sort_order", { ascending: true });
    if (opts.departmentKey) query = query.eq("department_key", opts.departmentKey);
    if (opts.freelancerOnly) query = query.eq("applies_to_freelancer", true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapModuleCatalog);
  }
}
