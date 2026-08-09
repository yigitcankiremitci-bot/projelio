import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ModuleAccess, ModuleMember, ModuleMemberRole } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";

function mapModuleMember(row: any): ModuleMember {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    moduleKey: row.module_key,
    userId: row.user_id ?? undefined,
    inviteEmail: row.invite_email ?? undefined,
    role: row.role,
    status: row.status,
    assignedBy: row.assigned_by ?? undefined,
    createdAt: row.created_at,
    removedAt: row.removed_at ?? undefined,
    fullName: row.users?.full_name ?? undefined,
    email: row.users?.email ?? undefined,
    username: row.users?.username ?? undefined,
    avatarUrl: row.users?.avatar_url ?? undefined,
  };
}

const NO_ACCESS = (moduleKey: string): ModuleAccess => ({
  moduleKey,
  canRead: false,
  canWrite: false,
  canManageTeam: false,
  reason: "none",
});

/**
 * Modül ekibi ve modül yetkisi.
 *
 * Bu servis eklenene kadar modül kayıtlarına yalnızca organizasyon sahibi ve
 * ilgili departmanın onaylı yöneticisi yazabiliyordu; "modüle atanan kişiler o
 * modülde çalışmaya başlar" vaadinin karşılığı yoktu. Yetki çözümlemesi tek
 * yerde toplansın diye ModuleRecordsService de buradaki resolveAccess'i kullanır.
 *
 * Bkz. database/migrations/042_module_members.sql
 */
@Injectable()
export class ModuleMembersService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  // PostgREST ipucu: module_members'ın users'a iki FK'sı var (user_id,
  // assigned_by). Hangi ilişkiyi kastettiğimizi açıkça belirtmezsek
  // "birden fazla ilişki bulundu" hatası alırız (department_members'ta da
  // aynı sorun yaşanmıştı).
  private readonly USER_JOIN = "*, users!module_members_user_id_fkey(full_name, email, username, avatar_url)";

  // ============================================================ Yetki çözümleme

  /**
   * Bir kullanıcının organizasyon içindeki bir modüldeki etkin yetkisi.
   *
   * Sıra önemli: en geniş yetkiden en dara doğru bakılır, ilk eşleşen kazanır.
   *   1. organizasyon sahibi          → tam yetki
   *   2. modülün etkin olduğu departmanın onaylı yöneticisi → tam yetki
   *   3. modül üyesi (manager)        → tam yetki
   *   4. modül üyesi (employee/subcontractor) → okuma + yazma
   *   5. modülün etkin olduğu departmanın onaylı üyesi → yalnızca okuma
   *   6. hiçbiri                      → erişim yok
   */
  async resolveOrganizationAccess(
    organizationId: string,
    moduleKey: string,
    userId?: string,
    departmentId?: string
  ): Promise<ModuleAccess> {
    if (!userId) return NO_ACCESS(moduleKey);

    // 1. Organizasyon sahibi
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    if (org.owner_id === userId) {
      return { moduleKey, canRead: true, canWrite: true, canManageTeam: true, reason: "owner" };
    }

    // 2 ve 5. Departman üyeliği. departmentId verilmişse yalnızca o departmana,
    // verilmemişse modülün etkin olduğu tüm departmanlara bakılır — böylece
    // "modül hangi departmanda açık?" bilgisi çağıranın sorumluluğu olmaktan çıkar.
    const departmentIds = departmentId
      ? [departmentId]
      : await this.departmentsWithModule(organizationId, moduleKey);

    let isDepartmentMember = false;
    if (departmentIds.length > 0) {
      const { data: deptRows } = await this.supabase.client
        .from("department_members")
        .select("role")
        .in("department_id", departmentIds)
        .eq("user_id", userId)
        .eq("status", "approved");

      for (const row of deptRows ?? []) {
        if (row.role === "manager") {
          return { moduleKey, canRead: true, canWrite: true, canManageTeam: true, reason: "department_manager" };
        }
        isDepartmentMember = true;
      }
    }

    // 3 ve 4. Modül üyeliği
    let memberQuery = this.supabase.client
      .from("module_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("module_key", moduleKey)
      .eq("user_id", userId)
      .eq("status", "approved")
      .is("removed_at", null);
    // Departman bağlamındaki atamalar kadar organizasyon geneli (department_id
    // boş) atamalar da geçerlidir — org geneli atanan kişi her departmanda yazabilir.
    if (departmentId) memberQuery = memberQuery.or(`department_id.eq.${departmentId},department_id.is.null`);

    const { data: memberRows } = await memberQuery;
    if (memberRows && memberRows.length > 0) {
      const isManager = memberRows.some((r: any) => r.role === "manager");
      return {
        moduleKey,
        canRead: true,
        canWrite: true,
        canManageTeam: isManager,
        reason: "module_member",
        role: isManager ? "manager" : (memberRows[0].role as ModuleMemberRole),
      };
    }

    // 5. Departman üyesi ama modüle atanmamış → yalnızca okuma
    if (isDepartmentMember) {
      return { moduleKey, canRead: true, canWrite: false, canManageTeam: false, reason: "department_member" };
    }

    return NO_ACCESS(moduleKey);
  }

  /** Serbest çalışan tarafı: iş sahibi tam yetkili, atanan kişiler yazabilir. */
  async resolveJobAccess(jobId: string, moduleKey: string, userId?: string): Promise<ModuleAccess> {
    if (!userId) return NO_ACCESS(moduleKey);

    const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", jobId).maybeSingle();
    if (!job) throw new NotFoundException("İş bulunamadı");
    if (job.owner_id === userId) {
      return { moduleKey, canRead: true, canWrite: true, canManageTeam: true, reason: "owner" };
    }

    const { data: memberRows } = await this.supabase.client
      .from("module_members")
      .select("role")
      .eq("job_id", jobId)
      .eq("module_key", moduleKey)
      .eq("user_id", userId)
      .eq("status", "approved")
      .is("removed_at", null);

    if (memberRows && memberRows.length > 0) {
      const isManager = memberRows.some((r: any) => r.role === "manager");
      return {
        moduleKey,
        canRead: true,
        canWrite: true,
        canManageTeam: isManager,
        reason: "module_member",
        role: isManager ? "manager" : (memberRows[0].role as ModuleMemberRole),
      };
    }

    return NO_ACCESS(moduleKey);
  }

  /** Modülün bir organizasyonda hangi departmanlarda etkinleştirildiği. */
  private async departmentsWithModule(organizationId: string, moduleKey: string): Promise<string[]> {
    const { data } = await this.supabase.client
      .from("organization_modules")
      .select("department_id")
      .eq("organization_id", organizationId)
      .eq("module_key", moduleKey);

    const ids = (data ?? []).map((r: any) => r.department_id).filter(Boolean) as string[];
    if (ids.length > 0) return ids;

    // Modül organizasyon geneli etkinleştirilmişse (department_id boş — kurulum
    // sihirbazından gelen eski kayıtlar böyle) hangi departmanın kapsadığını
    // katalogdan çıkarırız.
    const { data: catalogRow } = await this.supabase.client
      .from("module_catalog")
      .select("department_key")
      .eq("key", moduleKey)
      .maybeSingle();
    if (!catalogRow?.department_key) return [];

    const { data: deptRows } = await this.supabase.client
      .from("departments")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("catalog_key", catalogRow.department_key)
      .is("archived_at", null);
    return (deptRows ?? []).map((r: any) => r.id);
  }

  private async assertCanManageTeam(
    scope: { organizationId?: string; jobId?: string; departmentId?: string },
    moduleKey: string,
    userId?: string
  ): Promise<void> {
    if (!userId) return;
    const access = scope.jobId
      ? await this.resolveJobAccess(scope.jobId, moduleKey, userId)
      : await this.resolveOrganizationAccess(scope.organizationId!, moduleKey, userId, scope.departmentId);
    if (!access.canManageTeam) {
      throw new ForbiddenException("Modül ekibini yalnızca organizasyon sahibi, departman yöneticisi veya modül yöneticisi düzenleyebilir");
    }
  }

  // ============================================================ Ekip yönetimi

  async findByOrganizationModule(
    organizationId: string,
    moduleKey: string,
    departmentId?: string
  ): Promise<ModuleMember[]> {
    let query = this.supabase.client
      .from("module_members")
      .select(this.USER_JOIN)
      .eq("organization_id", organizationId)
      .eq("module_key", moduleKey)
      .is("removed_at", null)
      .order("created_at", { ascending: true });
    // Organizasyon geneli atamalar (department_id boş) her departmanın ekibinde görünür.
    if (departmentId) query = query.or(`department_id.eq.${departmentId},department_id.is.null`);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapModuleMember);
  }

  async findByJobModule(jobId: string, moduleKey: string): Promise<ModuleMember[]> {
    const { data, error } = await this.supabase.client
      .from("module_members")
      .select(this.USER_JOIN)
      .eq("job_id", jobId)
      .eq("module_key", moduleKey)
      .is("removed_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapModuleMember);
  }

  /** Kullanıcının atandığı tüm modüller — anasayfada "bana atanan modüller" için. */
  async findAssignedModules(userId: string): Promise<ModuleMember[]> {
    const { data, error } = await this.supabase.client
      .from("module_members")
      .select(this.USER_JOIN)
      .eq("user_id", userId)
      .eq("status", "approved")
      .is("removed_at", null);
    if (error) throw error;
    return (data ?? []).map(mapModuleMember);
  }

  async assign(
    scope: { organizationId?: string; jobId?: string },
    payload: { moduleKey?: string; departmentId?: string; userId?: string; inviteEmail?: string; role?: ModuleMemberRole },
    requestingUserId?: string
  ): Promise<ModuleMember> {
    if (!payload.moduleKey) throw new BadRequestException("moduleKey gerekli");
    if (!payload.userId && !payload.inviteEmail) throw new BadRequestException("userId veya inviteEmail gerekli");
    if (scope.jobId && payload.departmentId) {
      throw new BadRequestException("Serbest çalışan modüllerinde departman bağlamı olmaz");
    }

    await this.assertCanManageTeam(
      { ...scope, departmentId: payload.departmentId },
      payload.moduleKey,
      requestingUserId
    );

    // Kayıt yalnızca gerçekten etkinleştirilmiş bir modüle yapılabilir — aksi
    // halde kullanıcıya görünmeyen bir modüle kişi atanabilirdi
    // (ModuleRecordsService.createForJob'daki aynı kontrol).
    await this.assertModuleEnabled(scope, payload.moduleKey);

    const { data: row, error } = await this.supabase.client
      .from("module_members")
      .insert({
        organization_id: scope.organizationId ?? null,
        job_id: scope.jobId ?? null,
        department_id: payload.departmentId ?? null,
        module_key: payload.moduleKey,
        user_id: payload.userId ?? null,
        invite_email: payload.inviteEmail ?? null,
        role: payload.role ?? "employee",
        // Hesabı olan kişi doğrudan aktif üye olur; e-posta ile davet edilen
        // kişi hesap açana kadar davet durumunda bekler.
        status: payload.userId ? "approved" : "invited",
        assigned_by: requestingUserId ?? null,
      })
      .select(this.USER_JOIN)
      .single();

    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu kişi zaten bu modüle atanmış");
      throw error;
    }

    if (payload.userId) {
      const link = scope.jobId ? `/jobs/${scope.jobId}` : `/organizations/${scope.organizationId}`;
      void this.notificationsService.notifyUser(
        payload.userId,
        "team_invite",
        "Modüle Atandın",
        "Bir modülde çalışmak üzere atandın.",
        link
      );
    }

    return mapModuleMember(row);
  }

  private async assertModuleEnabled(
    scope: { organizationId?: string; jobId?: string },
    moduleKey: string
  ): Promise<void> {
    if (scope.jobId) {
      const { data } = await this.supabase.client
        .from("job_modules")
        .select("id")
        .eq("job_id", scope.jobId)
        .eq("module_key", moduleKey)
        .maybeSingle();
      if (!data) throw new BadRequestException("Bu modül bu işe atanmamış");
      return;
    }
    const { data } = await this.supabase.client
      .from("organization_modules")
      .select("id")
      .eq("organization_id", scope.organizationId)
      .eq("module_key", moduleKey)
      .limit(1);
    if (!data || data.length === 0) throw new BadRequestException("Bu modül bu organizasyonda etkin değil");
  }

  async updateRole(id: string, role: ModuleMemberRole, requestingUserId?: string): Promise<ModuleMember> {
    const existing = await this.findOne(id);
    await this.assertCanManageTeam(
      { organizationId: existing.organizationId, jobId: existing.jobId, departmentId: existing.departmentId },
      existing.moduleKey,
      requestingUserId
    );

    const { data: row, error } = await this.supabase.client
      .from("module_members")
      .update({ role })
      .eq("id", id)
      .select(this.USER_JOIN)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Atama bulunamadı");
    return mapModuleMember(row);
  }

  /**
   * Çıkarma kaydı silmez, işaretler — kimin ne zaman hangi modülde çalıştığı
   * bilgisi denetim için korunur (bkz. docs/moduller/00-modul-mimarisi.md,
   * "arşivle, silme" arketip kararı).
   */
  async remove(id: string, requestingUserId?: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.assertCanManageTeam(
      { organizationId: existing.organizationId, jobId: existing.jobId, departmentId: existing.departmentId },
      existing.moduleKey,
      requestingUserId
    );

    const { error } = await this.supabase.client
      .from("module_members")
      .update({ status: "removed", removed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async findOne(id: string): Promise<ModuleMember> {
    const { data, error } = await this.supabase.client
      .from("module_members")
      .select(this.USER_JOIN)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Atama bulunamadı");
    return mapModuleMember(data);
  }
}
