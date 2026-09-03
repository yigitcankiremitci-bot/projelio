import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ProjectMember } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireOneOf } from "../../common/validation/input";
import { FilesService } from "../files/files.service";
import { NotificationsService } from "../notifications/notifications.service";

function mapMember(row: any): ProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    title: row.title ?? undefined,
    status: row.status,
    customAgreedRate: row.custom_agreed_rate != null ? Number(row.custom_agreed_rate) : undefined,
    canViewBudget: row.can_view_budget ?? false,
    joinedAt: row.joined_at,
    fullName: row.users?.full_name ?? undefined,
    email: row.users?.email ?? undefined,
    username: row.users?.username ?? undefined,
  };
}

/**
 * project_members.role için izin verilen değerler — 001_init_schema.sql'deki CHECK
 * kısıtıyla birebir aynı. MemberRole yalnızca bir TypeScript tipi olduğu için
 * gövdeden gelen rol çalışma anında denetlenmiyordu (controller'da `role?: any`).
 */
const PROJECT_MEMBER_ROLES = ["owner", "member", "subcontractor"] as const;

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService,
    private filesService: FilesService
  ) {}

  /**
   * Ekip değiştiğinde projenin Drive klasör izinlerini yeniden hizalar.
   *
   * Yeni üye eklendiğinde izin verilir, üyelikten çıkarıldığında geri alınır.
   * Bu adım atlanırsa ayrılan üyenin Google hesabı projenin dosyalarına
   * erişmeye devam eder — Projelio'dan çıkarılmış olsa bile.
   *
   * Beklemeden çağrılır: üye ekleme yanıtı Drive'ın yavaşlığına takılmasın.
   */
  private syncDriveShares(projectId: string): void {
    void this.filesService
      .syncSharesForProject(projectId)
      .catch((err) =>
        this.logger.warn(`Drive izinleri eşitlenemedi (project=${projectId}): ${String(err)}`)
      );
  }

  // Proje yöneticisi: proje sahibi ya da (proje bir işe bağlıysa) o işin sahibi.
  // Davet gönderme, doğrudan üye ekleme, ücret/görünürlük belirleme gibi yönetimsel
  // işlemler yalnızca yöneticiye açık (bkz. projects.service.ts'teki assertCanManage
  // ile aynı desen — kasıtlı olarak burada da ayrıca uygulanıyor, modüller arası
  // döngüsel bağımlılık yaratmamak için).
  private async assertIsProjectManager(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) return;
    if (project.job_id) {
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", project.job_id).maybeSingle();
      if (job?.owner_id === userId) return;
    }
    throw new ForbiddenException("Bu işlemi yalnızca proje veya iş sahibi yapabilir");
  }

  // Ekip listesini (isim/e-posta içerdiği için) proje yöneticisi ve projenin
  // onaylı üyeleri görebilir; projeyle hiç ilgisi olmayan biri göremez.
  private async assertCanViewTeam(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) return;
    if (project.job_id) {
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", project.job_id).maybeSingle();
      if (job?.owner_id === userId) return;
    }
    const { data: membership } = await this.supabase.client
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (membership) return;
    throw new ForbiddenException("Bu projenin ekibini yalnızca proje ekibi görebilir");
  }

  // Bir üyelik kaydının hangi projeye ait olduğunu ve kimin üyeliği olduğunu döner —
  // memberId üzerinden çalışan uçlar (setTitle, respond, setRate, ...) yetki
  // kontrolünden önce buna ihtiyaç duyar.
  private async getMemberScope(memberId: string): Promise<{ projectId: string; userId: string } | null> {
    const { data } = await this.supabase.client
      .from("project_members")
      .select("project_id, user_id")
      .eq("id", memberId)
      .maybeSingle();
    if (!data) return null;
    return { projectId: data.project_id, userId: data.user_id };
  }

  async findByProject(projectId: string, requestingUserId?: string): Promise<ProjectMember[]> {
    await this.assertCanViewTeam(projectId, requestingUserId);

    const { data, error } = await this.supabase.client
      .from("project_members")
      .select("*, users(full_name, email, username)")
      .eq("project_id", projectId);
    if (error) throw error;
    const members = (data ?? []).map(mapMember);

    // Proje yöneticisi (sahibi) ekip sekmesinde her zaman görünsün: project_members
    // kaydı yoksa sanal bir "owner" satırı olarak listenin başına eklenir.
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, created_at, users:users!projects_owner_id_fkey(full_name, email, username)")
      .eq("id", projectId)
      .maybeSingle();
    if (project?.owner_id && !members.some((m) => m.userId === project.owner_id)) {
      const ownerUser = (project as any).users;
      members.unshift({
        id: `owner-${project.owner_id}`,
        projectId,
        userId: project.owner_id,
        role: "owner",
        status: "approved",
        canViewBudget: true,
        joinedAt: (project as any).created_at,
        fullName: ownerUser?.full_name ?? undefined,
        email: ownerUser?.email ?? undefined,
        username: ownerUser?.username ?? undefined,
      } as ProjectMember);
    }
    return members;
  }

  // Proje yöneticisi tarafından davet gönderilir (e-posta veya bağlantı ile)
  async invite(
    projectId: string,
    userId: string,
    role: ProjectMember["role"] = "member",
    requestingUserId?: string
  ): Promise<ProjectMember> {
    await this.assertIsProjectManager(projectId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .insert({ project_id: projectId, user_id: userId, role: requireOneOf(role, PROJECT_MEMBER_ROLES, "Rol") })
      .select()
      .single();
    if (error) throw error;
    this.notificationsService.notifyUserSafe(userId, "team_invite", "Ekip Daveti", "Bir projeye davet edildiniz.");
    return mapMember(row);
  }

  // Freelancer var olan bir projeye katılım isteği atar. Controller, userId'nin
  // her zaman isteği yapan kullanıcının kendisi olduğunu garanti eder — böylece
  // biri başka bir kullanıcı adına katılım isteği açamaz.
  async requestToJoin(projectId: string, userId: string): Promise<ProjectMember> {
    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .insert({ project_id: projectId, user_id: userId, role: "member" })
      .select()
      .single();
    if (error) throw error;
    return mapMember(row);
  }

  // Proje yöneticisi ekibe doğrudan üye ekler (onay bekletmeden).
  // "title": proje yöneticisinin serbest yazdığı görev/unvan (örn. "Elektrik taşeronu");
  // yetkilendirmeyi etkilemez, sadece görüntüleme amaçlıdır.
  /**
   * Kullanıcının kendi isteğiyle projeden ayrılması.
   *
   * Yöneticinin birini çıkarmasından ayrı bir yol: burada yetki "yönetici olmak"
   * değil "o kayıt benim olmak". Kullanıcı bir projeye eklendiği için orada
   * kalmaya mahkûm olmamalı; bugün ayrılmanın tek yolu proje sahibine haber
   * verip onun çıkarmasını beklemekti.
   *
   * Proje sahibi ayrılamaz: sahipsiz kalan bir projede kimse üye ekleyemez,
   * bütçe göremez ve projeyi kapatamaz.
   */
  /** Bildirim metninde kullanılacak görünen ad. */
  private async getUserName(userId?: string): Promise<string | undefined> {
    if (!userId) return undefined;
    const { data } = await this.supabase.client.from("users").select("full_name").eq("id", userId).maybeSingle();
    return data?.full_name ?? undefined;
  }

  async leaveProject(projectId: string, userId: string): Promise<{ success: true }> {
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, title")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) {
      throw new ForbiddenException("Proje sahibi kendi projesinden ayrılamaz");
    }

    const { data: membership } = await this.supabase.client
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) throw new NotFoundException("Bu projede bir üyeliğin yok");

    const { error } = await this.supabase.client.from("project_members").delete().eq("id", membership.id);
    if (error) throw error;

    // Proje sahibi haberdar olsun: ekipten biri sessizce düşmesin.
    if (project.owner_id) {
      const name = await this.getUserName(userId);
      this.notificationsService.notifyUserSafe(
        project.owner_id,
        "role_updated",
        "Ekipten ayrılma",
        name
          ? `${name}, "${project.title}" projesinden ayrıldı.`
          : `Bir ekip üyesi "${project.title}" projesinden ayrıldı.`,
        `/projects/${projectId}`
      );
    }
    return { success: true };
  }

  async addMember(
    projectId: string,
    userId: string,
    role: ProjectMember["role"] = "member",
    title?: string,
    requestingUserId?: string
  ): Promise<ProjectMember> {
    await this.assertIsProjectManager(projectId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .insert({
        project_id: projectId,
        user_id: userId,
        role: requireOneOf(role, PROJECT_MEMBER_ROLES, "Rol"),
        title: title?.trim() || null,
        status: "approved",
      })
      .select("*, users(full_name, email, username)")
      .single();
    if (error) throw error;
    this.notificationsService.notifyUserSafe(
      userId,
      "member_joined",
      "Ekibe Eklendin",
      "Bir projeye eklendin.",
      `/projects/${projectId}`
    );
    this.syncDriveShares(projectId);
    return mapMember(row);
  }

  async setTitle(memberId: string, title: string, requestingUserId?: string): Promise<ProjectMember> {
    const scope = await this.getMemberScope(memberId);
    if (!scope) throw new NotFoundException("Üyelik bulunamadı");
    await this.assertIsProjectManager(scope.projectId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .update({ title: title?.trim() || null })
      .eq("id", memberId)
      .select("*, users(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Üyelik bulunamadı");
    return mapMember(row);
  }

  async setBudgetVisibility(memberId: string, canViewBudget: boolean, requestingUserId?: string): Promise<ProjectMember> {
    const scope = await this.getMemberScope(memberId);
    if (!scope) throw new NotFoundException("Üyelik bulunamadı");
    await this.assertIsProjectManager(scope.projectId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .update({ can_view_budget: canViewBudget })
      .eq("id", memberId)
      .select("*, users(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Üyelik bulunamadı");
    return mapMember(row);
  }

  // Bir üyelik kaydı ya proje yöneticisinin gönderdiği bir davettir (kabul/red
  // edecek olan davet edilen kişidir) ya da bir katılım isteğidir (onaylayacak
  // olan proje yöneticisidir). İkisi de aynı tabloda ayrım yapılmadan tutulduğu
  // için burada ikisine de izin veriyoruz; üçüncü bir kişiye izin vermiyoruz.
  async respond(memberId: string, approve: boolean, requestingUserId?: string): Promise<ProjectMember> {
    const scope = await this.getMemberScope(memberId);
    if (!scope) throw new NotFoundException("Üyelik isteği bulunamadı");
    if (requestingUserId && requestingUserId !== scope.userId) {
      await this.assertIsProjectManager(scope.projectId, requestingUserId);
    }

    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .update({ status: approve ? "approved" : "rejected" })
      .eq("id", memberId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Üyelik isteği bulunamadı");
    const member = mapMember(row);
    if (approve) {
      this.notificationsService.notifyUserSafe(
        member.userId,
        "member_joined",
        "Projeye Katıldın",
        "Katılım isteğin onaylandı.",
        `/projects/${member.projectId}`
      );
    }
    // Onay da ret de izin durumunu değiştirebilir: onaylanan erişim kazanır,
    // reddedilen (daha önce onaylıysa) erişimini kaybeder.
    this.syncDriveShares(member.projectId);
    return member;
  }

  async setRate(memberId: string, rate: number, requestingUserId?: string): Promise<ProjectMember> {
    const scope = await this.getMemberScope(memberId);
    if (!scope) throw new NotFoundException("Üyelik bulunamadı");
    await this.assertIsProjectManager(scope.projectId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .update({ custom_agreed_rate: rate })
      .eq("id", memberId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Üyelik bulunamadı");
    const member = mapMember(row);
    this.notificationsService.notifyUserSafe(
      member.userId,
      "budget_changed",
      "Anlaşma Güncellendi",
      "Ücret anlaşmanız güncellendi."
    );
    return member;
  }
}
