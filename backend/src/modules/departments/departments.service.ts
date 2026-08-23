import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Department, DepartmentAccess, DepartmentMemberRole } from "@projelio/shared";
import { applyOrder } from "../../common/reorder.util";
import { SupabaseService } from "../../database/supabase.service";
import { removeStaleUploadsInFolder } from "../../common/storage/public-upload.util";
import { decideDepartmentAccess } from "./department-access";
import { detectImageUpload } from "../../common/upload-image.util";

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

  // --- Görünürlük ---------------------------------------------------------
  //
  // Bir departman, kadrosunda olmayan hiç kimseye görünmez. Bu kural eskiden
  // yoktu: findByOrganization requestingUserId almadığı için bir departmana
  // taşeron olarak eklenen kullanıcı, sidebar'ın çektiği
  // /organizations/:id/departments yanıtında organizasyonun TÜM departmanlarını
  // görüyordu. Karar mantığı department-access.ts'te (saf, test edilebilir);
  // burada yalnızca o fonksiyonun ihtiyacı olan gerçekler toplanıyor.

  /** Bir kullanıcının organizasyon seviyesindeki konumu — departman başına tekrar sorulmasın. */
  private async orgStanding(
    organizationId: string,
    userId: string
  ): Promise<{ isOrgOwner: boolean; isOrgMember: boolean }> {
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (org?.owner_id === userId) return { isOrgOwner: true, isOrgMember: true };

    const { data: member } = await this.supabase.client
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    return { isOrgOwner: false, isOrgMember: !!member };
  }

  /** Kullanıcının verilen departmanlardaki ONAYLI kadro rolleri. */
  private async approvedRoles(
    departmentIds: string[],
    userId: string
  ): Promise<Map<string, DepartmentMemberRole>> {
    const roles = new Map<string, DepartmentMemberRole>();
    if (departmentIds.length === 0) return roles;
    const { data } = await this.supabase.client
      .from("department_members")
      .select("department_id, role")
      .in("department_id", departmentIds)
      .eq("user_id", userId)
      .eq("status", "approved");
    for (const row of data ?? []) roles.set(row.department_id, row.role as DepartmentMemberRole);
    return roles;
  }

  /**
   * Tek bir departman için kullanıcının görünürlüğü. userId verilmezse (dahili
   * çağrılar, arka plan işleri) tam yetki varsayılır — mevcut desenle aynı.
   */
  async getAccess(departmentId: string, userId?: string): Promise<DepartmentAccess> {
    if (!userId) {
      return { role: "owner", canView: true, canViewTeam: true, canViewBudget: true, canManage: true };
    }
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (!dept) throw new NotFoundException("Departman bulunamadı");

    const [standing, roles] = await Promise.all([
      this.orgStanding(dept.organization_id, userId),
      this.approvedRoles([departmentId], userId),
    ]);
    return decideDepartmentAccess({ ...standing, membershipRole: roles.get(departmentId) });
  }

  /** getAccess + "göremiyorsan 403" kısayolu. */
  async assertCanView(departmentId: string, userId?: string): Promise<DepartmentAccess> {
    const access = await this.getAccess(departmentId, userId);
    if (!access.canView) throw new ForbiddenException("Bu departmanı görüntüleme yetkiniz yok");
    return access;
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

  // requestingUserId verilirse liste kullanıcının GÖREBİLDİĞİ departmanlara
  // indirgenir: organizasyon sahibi/üyesi hepsini, kadro üyesi (çalışan/taşeron)
  // yalnızca kendi departmanlarını görür. Her kayda viewerAccess iliştirilir ki
  // arayüz Bütçe/Ekip sekmelerini yetkisi olmayana hiç göstermesin.
  async findByOrganization(organizationId: string, requestingUserId?: string): Promise<Department[]> {
    const { data, error } = await this.supabase.client
      .from("departments")
      .select("*")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    let departments = (data ?? []).map(mapDepartment);

    if (requestingUserId) {
      const [standing, roles] = await Promise.all([
        this.orgStanding(organizationId, requestingUserId),
        this.approvedRoles(
          departments.map((d) => d.id),
          requestingUserId
        ),
      ]);
      departments = departments
        .map((d) => ({
          ...d,
          viewerAccess: decideDepartmentAccess({ ...standing, membershipRole: roles.get(d.id) }),
        }))
        .filter((d) => d.viewerAccess?.canView);
    }

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

  // Departmanlar sekmesinde basılı tutup sürükleyerek sıralama (bkz.
  // OrganizationsService.reorder ile aynı desen — useSortableList).
  async reorder(organizationId: string, ids: string[], requestingUserId?: string): Promise<void> {
    if (!ids?.length) return;
    await this.assertOrgOwner(organizationId, requestingUserId);

    const { data: rows, error } = await this.supabase.client
      .from("departments")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    await applyOrder(this.supabase.client, "departments", ids);
  }

  // requestingUserId verilirse kadroda olmayan kullanıcı 403 alır — departman
  // sayfasının doğrudan URL ile açılması da bu kapıdan geçer.
  async findOne(id: string, requestingUserId?: string): Promise<Department> {
    const { data, error } = await this.supabase.client.from("departments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Departman bulunamadı");
    const department = mapDepartment(data);
    if (requestingUserId) {
      department.viewerAccess = await this.assertCanView(id, requestingUserId);
    }
    return department;
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

    // Tur ve uzanti istemcinin sozune degil, dosyanin ilk baytlarindaki
    // imzaya gore belirlenir (bkz. common/upload-image.util.ts).
    const { contentType, ext } = detectImageUpload(file);
    const path = `${id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(COVER_BUCKET)
      .upload(path, file.buffer, { contentType, upsert: true });
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

    // Kayıt güncellendikten SONRA temizle: güncelleme başarısız olursa eski görsel
    // yerinde kalsın, kayıt silinmiş bir dosyaya işaret etmesin.
    await removeStaleUploadsInFolder(this.supabase.client, COVER_BUCKET, path);

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
