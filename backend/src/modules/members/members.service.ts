import { Injectable, NotFoundException } from "@nestjs/common";
import type { ProjectMember } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";

function mapMember(row: any): ProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    customAgreedRate: row.custom_agreed_rate != null ? Number(row.custom_agreed_rate) : undefined,
    canViewBudget: row.can_view_budget ?? false,
    joinedAt: row.joined_at,
    fullName: row.users?.full_name ?? undefined,
    email: row.users?.email ?? undefined,
  };
}

@Injectable()
export class MembersService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  async findByProject(projectId: string): Promise<ProjectMember[]> {
    const { data, error } = await this.supabase.client
      .from("project_members")
      .select("*, users(full_name, email)")
      .eq("project_id", projectId);
    if (error) throw error;
    return (data ?? []).map(mapMember);
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

  // Proje yöneticisi ekibe doğrudan üye ekler (onay bekletmeden)
  async addMember(
    projectId: string,
    userId: string,
    role: ProjectMember["role"] = "member"
  ): Promise<ProjectMember> {
    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .insert({ project_id: projectId, user_id: userId, role, status: "approved" })
      .select("*, users(full_name, email)")
      .single();
    if (error) throw error;
    this.notificationsService.notifyUser(
      userId,
      "member_joined",
      "Ekibe Eklendin",
      "Bir projeye eklendin.",
      `/projects/${projectId}`
    );
    return mapMember(row);
  }

  async setBudgetVisibility(memberId: string, canViewBudget: boolean): Promise<ProjectMember> {
    const { data: row, error } = await this.supabase.client
      .from("project_members")
      .update({ can_view_budget: canViewBudget })
      .eq("id", memberId)
      .select("*, users(full_name, email)")
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
