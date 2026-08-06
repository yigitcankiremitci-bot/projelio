import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Department } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

const COVER_BUCKET = "department-covers";

const VALID_DEFAULT_TABS = ["flow", "team", "tasks", "budget", "modules", "files"];

function mapDepartment(row: any): Department {
  return {
    id: row.id,
    organizationId: row.organization_id,
    catalogKey: row.catalog_key ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    // Yalnızca kullanıcının yüklediği ÖZEL kapak döner — boşsa istemci
    // catalogKey'e göre varsayılan kapağı gösterir (bkz. Department tipi notu).
    coverImageUrl: row.cover_image_url ?? undefined,
    sortOrder: row.sort_order ?? 0,
    defaultTab: row.default_tab ?? "tasks",
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

@Injectable()
export class DepartmentsService {
  constructor(private supabase: SupabaseService) {}

  // Organizasyonu sadece sahibi yönetebilir (organizations modülündeki desenle aynı).
  private async assertOrgOwner(organizationId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!data) throw new NotFoundException("Organizasyon bulunamadı");
    if (data.owner_id !== userId) throw new ForbiddenException("Bu organizasyonu yalnızca sahibi düzenleyebilir");
  }

  // Kullanıcının sahibi olduğu organizasyonlardaki TÜM departmanlar + onaylı
  // kadrosunda olduğu departmanlar — organizasyonlar arası bir seçici için
  // (örn. görev taşıma hedefi, bkz. TasksService.move / MoveTaskModal).
  async findAllForUser(userId: string): Promise<Department[]> {
    const { data: ownedOrgs, error: ownedOrgsError } = await this.supabase.client
      .from("organizations")
      .select("id")
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (ownedOrgsError) throw ownedOrgsError;
    const ownedOrgIds = (ownedOrgs ?? []).map((o: any) => o.id as string);

    const { data: memberships, error: membershipError } = await this.supabase.client
      .from("department_members")
      .select("department_id")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (membershipError) throw membershipError;
    const memberDeptIds = (memberships ?? []).map((m: any) => m.department_id as string);

    const byId = new Map<string, any>();

    if (ownedOrgIds.length > 0) {
      const { data, error } = await this.supabase.client
        .from("departments")
        .select("*")
        .in("organization_id", ownedOrgIds)
        .is("archived_at", null);
      if (error) throw error;
      for (const row of data ?? []) byId.set(row.id, row);
    }
    if (memberDeptIds.length > 0) {
      const { data, error } = await this.supabase.client
        .from("departments")
        .select("*")
        .in("id", memberDeptIds)
        .is("archived_at", null);
      if (error) throw error;
      for (const row of data ?? []) byId.set(row.id, row);
    }

    return Array.from(byId.values())
      .map(mapDepartment)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async findByOrganization(organizationId: string): Promise<Department[]> {
    const { data, error } = await this.supabase.client
      .from("departments")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    const departments = (data ?? []).map(mapDepartment);

    const deptIds = departments.map((d) => d.id);
    if (deptIds.length > 0) {
      const { data: memberRows } = await this.supabase.client
        .from("department_members")
        .select("department_id")
        .in("department_id", deptIds)
        .neq("status", "removed");
      const counts = new Map<string, number>();
      for (const m of memberRows ?? []) counts.set(m.department_id, (counts.get(m.department_id) ?? 0) + 1);
      for (const d of departments) d.memberCount = counts.get(d.id) ?? 0;
    }

    return departments;
  }

  async findOne(id: string): Promise<Department> {
    const { data, error } = await this.supabase.client.from("departments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Departman bulunamadı");
    return mapDepartment(data);
  }

  // catalogKey verilirse departman katalogdaki standart isim/açıklamayla açılır
  // (name/description override edilebilir); verilmezse özel departmandır.
  async create(
    organizationId: string,
    data: { catalogKey?: string; name?: string; description?: string },
    requestingUserId?: string
  ): Promise<Department> {
    await this.assertOrgOwner(organizationId, requestingUserId);

    let name = data.name?.trim();
    let description = data.description?.trim();

    if (data.catalogKey) {
      const { data: catalogRow, error: catalogError } = await this.supabase.client
        .from("department_catalog")
        .select("*")
        .eq("key", data.catalogKey)
        .maybeSingle();
      if (catalogError) throw catalogError;
      if (!catalogRow) throw new BadRequestException("Geçersiz departman kataloğu anahtarı");
      if (!name) name = catalogRow.name;
      if (!description) description = catalogRow.description ?? undefined;
    }

    if (!name) throw new BadRequestException("Departman adı gerekli");

    const { data: row, error } = await this.supabase.client
      .from("departments")
      .insert({
        organization_id: organizationId,
        catalog_key: data.catalogKey ?? null,
        name,
        description: description ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu departman zaten eklenmiş");
      throw error;
    }
    return mapDepartment(row);
  }

  async update(
    id: string,
    data: { name?: string; description?: string; defaultTab?: string },
    requestingUserId?: string
  ): Promise<Department> {
    const existing = await this.findOne(id);
    await this.assertOrgOwner(existing.organizationId, requestingUserId);

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description.trim() || null;
    if (data.defaultTab !== undefined) {
      if (!VALID_DEFAULT_TABS.includes(data.defaultTab)) {
        throw new BadRequestException("Geçersiz açılış sekmesi");
      }
      patch.default_tab = data.defaultTab;
    }

    const { data: row, error } = await this.supabase.client
      .from("departments")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Departman bulunamadı");
    return mapDepartment(row);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.assertOrgOwner(existing.organizationId, requestingUserId);
    const { error } = await this.supabase.client.from("departments").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string, requestingUserId?: string): Promise<Department> {
    const existing = await this.findOne(id);
    await this.assertOrgOwner(existing.organizationId, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("departments")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Departman bulunamadı");
    return mapDepartment(row);
  }

  async restore(id: string, requestingUserId?: string): Promise<Department> {
    const existing = await this.findOne(id);
    await this.assertOrgOwner(existing.organizationId, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("departments")
      .update({ archived_at: null })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Departman bulunamadı");
    return mapDepartment(row);
  }

  // Özel kapak yükleme (bkz. OrganizationsService/ProductsService ile aynı desen).
  async uploadCover(id: string, file: Express.Multer.File, requestingUserId?: string): Promise<Department> {
    const existing = await this.findOne(id);
    await this.assertOrgOwner(existing.organizationId, requestingUserId);

    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
    const path = `${id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(COVER_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = this.supabase.client.storage.from(COVER_BUCKET).getPublicUrl(path);

    const { data: row, error } = await this.supabase.client
      .from("departments")
      .update({ cover_image_url: publicUrlData.publicUrl })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Departman bulunamadı");
    return mapDepartment(row);
  }

  // Özel kapağı kaldırır — kolon null'a döner, istemci otomatik olarak
  // catalogKey'e ait varsayılan kapağı gösterir ("silse bile default geri gelsin").
  async removeCover(id: string, requestingUserId?: string): Promise<Department> {
    const existing = await this.findOne(id);
    await this.assertOrgOwner(existing.organizationId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("departments")
      .update({ cover_image_url: null })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Departman bulunamadı");
    return mapDepartment(row);
  }
}
