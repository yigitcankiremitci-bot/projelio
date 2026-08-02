import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ProjectMember } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
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

  async findByProject(projectId: string): Promise<ProjectMember[]> {
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
    role: ProjectMember["role"] = "member"
  ): Promise<ProjectMember> {
    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .insert({ project_id: projectId, user_id: userId, role })
      .select()
      .single();
    if (error) throw error;
    this.notificationsService.notifyUser(userId, "team_invite", "Ekip Daveti", "Bir projeye davet edildiniz.");
    return mapMember(row);
  }

  // Freelancer var olan bir projeye katılım isteği atar
  async requestToJoin(projectId: string, userId: string): Promise<ProjectMember> {
    return this.invite(projectId, userId, "member");
  }

  // Proje yöneticisi ekibe doğrudan üye ekler (onay bekletmeden).
  // "title": proje yöneticisinin serbest yazdığı görev/unvan (örn. "Elektrik taşeronu");
  // yetkilendirmeyi etkilemez, sadece görüntüleme amaçlıdır.
  async addMember(
    projectId: string,
    userId: string,
    role: ProjectMember["role"] = "member",
    title?: string
  ): Promise<ProjectMember> {
    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .insert({ project_id: projectId, user_id: userId, role, title: title?.trim() || null, status: "approved" })
      .select("*, users(full_name, email, username)")
      .single();
    if (error) throw error;
    this.notificationsService.notifyUser(
      userId,
      "member_joined",
      "Ekibe Eklendin",
      "Bir projeye eklendin.",
      `/projects/${projectId}`
    );
    this.syncDriveShares(projectId);
    return mapMember(row);
  }

  async setTitle(memberId: string, title: string): Promise<ProjectMember> {
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

  async setBudgetVisibility(memberId: string, canViewBudget: boolean): Promise<ProjectMember> {
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

  async respond(memberId: string, approve: boolean): Promise<ProjectMember> {
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
      this.notificationsService.notifyUser(
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

  async setRate(memberId: string, rate: number): Promise<ProjectMember> {
    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .update({ custom_agreed_rate: rate })
      .eq("id", memberId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Üyelik bulunamadı");
    const member = mapMember(row);
    this.notificationsService.notifyUser(
      member.userId,
      "budget_changed",
      "Anlaşma Güncellendi",
      "Ücret anlaşmanız güncellendi."
    );
    return member;
  }
}
