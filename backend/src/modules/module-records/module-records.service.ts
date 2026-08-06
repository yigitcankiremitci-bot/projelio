import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ModuleRecord } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapModuleRecord(row: any): ModuleRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    departmentId: row.department_id ?? undefined,
    moduleKey: row.module_key,
    data: row.data ?? {},
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

// Tam özellikli hale getirilen modüllerin (Gelir-Gider, Fatura, Müşteri, İşe
// Alım vb.) kayıtları — bkz. ProductsService ile aynı desen (yetki: organizasyon
// sahibi ya da ilgili departmanın onaylı yöneticisi).
@Injectable()
export class ModuleRecordsService {
  constructor(private supabase: SupabaseService) {}

  private async assertCanManage(organizationId: string, departmentId?: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    if (org.owner_id === userId) return;

    if (departmentId) {
      const { data: managerRow } = await this.supabase.client
        .from("department_members")
        .select("id")
        .eq("department_id", departmentId)
        .eq("user_id", userId)
        .eq("role", "manager")
        .eq("status", "approved")
        .maybeSingle();
      if (managerRow) return;
    }
    throw new ForbiddenException("Bu kaydı yalnızca organizasyon sahibi veya departman yöneticisi düzenleyebilir");
  }

  async findByOrganization(organizationId: string, moduleKey?: string): Promise<ModuleRecord[]> {
    let query = this.supabase.client
      .from("module_records")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (moduleKey) query = query.eq("module_key", moduleKey);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapModuleRecord);
  }

  async findOne(id: string): Promise<ModuleRecord> {
    const { data, error } = await this.supabase.client.from("module_records").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return mapModuleRecord(data);
  }

  async create(
    organizationId: string,
    data: { departmentId?: string; moduleKey?: string; data?: Record<string, unknown> },
    requestingUserId?: string
  ): Promise<ModuleRecord> {
    if (!data.moduleKey) throw new BadRequestException("moduleKey gerekli");
    await this.assertCanManage(organizationId, data.departmentId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .insert({
        organization_id: organizationId,
        department_id: data.departmentId ?? null,
        module_key: data.moduleKey,
        data: data.data ?? {},
        created_by: requestingUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapModuleRecord(row);
  }

  async update(id: string, patchData: Record<string, unknown>, requestingUserId?: string): Promise<ModuleRecord> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("module_records")
      .update({ data: patchData })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapModuleRecord(row);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.assertCanManage(existing.organizationId, existing.departmentId, requestingUserId);
    const { error } = await this.supabase.client.from("module_records").delete().eq("id", id);
    if (error) throw error;
  }
}
