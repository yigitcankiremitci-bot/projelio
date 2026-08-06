import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { DepartmentMember } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";

function mapDepartmentMember(row: any): DepartmentMember {
  return {
    id: row.id,
    departmentId: row.department_id,
    userId: row.user_id ?? undefined,
    inviteEmail: row.invite_email ?? undefined,
    role: row.role,
    title: row.title ?? undefined,
    reportsTo: row.reports_to ?? undefined,
    status: row.status,
    accessUntil: row.access_until ?? undefined,
    invitedBy: row.invited_by ?? undefined,
    joinedAt: row.joined_at,
    fullName: row.users?.full_name ?? undefined,
    email: row.users?.email ?? undefined,
    username: row.users?.username ?? undefined,
  };
}

// "Kadro": bir departmana bağlı pozisyon + kişi. Doküman akışı: önce pozisyon
// (rol/unvan) tanımlanır — kişi zaten sistemde ise userId ile, değilse
// inviteEmail ile — sonra ilgili kişi daveti onaylar (respond).
@Injectable()
export class DepartmentMembersService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  private async assertOrgOwner(departmentId: string, userId?: string): Promise<string> {
    const { data: dept, error } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (error) throw error;
    if (!dept) throw new NotFoundException("Departman bulunamadı");
    if (!userId) return dept.organization_id;

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    if (org && org.owner_id !== userId) {
      // Sahibi değilse departman yöneticisi olup olmadığına bak.
      const { data: managerRow } = await this.supabase.client
        .from("department_members")
        .select("id")
        .eq("department_id", departmentId)
        .eq("user_id", userId)
        .eq("role", "manager")
        .eq("status", "approved")
        .maybeSingle();
      if (!managerRow) throw new ForbiddenException("Bu departmanı yalnızca organizasyon sahibi veya departman yöneticisi düzenleyebilir");
    }
    return dept.organization_id;
  }

  async findByDepartment(departmentId: string): Promise<DepartmentMember[]> {
    const { data, error } = await this.supabase.client
      .from("department_members")
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .eq("department_id", departmentId)
      .neq("status", "removed")
      .order("joined_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapDepartmentMember);
  }

  async invite(
    departmentId: string,
    data: { userId?: string; inviteEmail?: string; role?: DepartmentMember["role"]; title?: string },
    requestingUserId?: string
  ): Promise<DepartmentMember> {
    await this.assertOrgOwner(departmentId, requestingUserId);
    if (!data.userId && !data.inviteEmail) {
      throw new BadRequestException("Kadroya bir kullanıcı ya da davet e-postası gerekli");
    }

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .insert({
        department_id: departmentId,
        user_id: data.userId ?? null,
        invite_email: data.userId ? null : data.inviteEmail?.trim().toLowerCase(),
        role: data.role ?? "employee",
        title: data.title?.trim() || null,
        status: data.userId ? "pending" : "invited",
        invited_by: requestingUserId ?? null,
      })
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu kişi zaten bu departmanın kadrosunda");
      throw error;
    }

    if (data.userId) {
      // link: bildirime tıklayınca doğrudan departman sayfasına gider — orada
      // DepartmentMembersList kendi bekleyen davetini algılayıp Onayla/Reddet
      // düğmelerini gösterir (bkz. respond()).
      void this.notificationsService.notifyUser(
        data.userId,
        "team_invite",
        "Kadro Daveti",
        "Bir departmanın kadrosuna davet edildin.",
        `/departments/${departmentId}`
      );
    }

    return mapDepartmentMember(row);
  }

  async updatePosition(
    id: string,
    data: { role?: DepartmentMember["role"]; title?: string; reportsTo?: string },
    requestingUserId?: string
  ): Promise<DepartmentMember> {
    const existing = await this.findById(id);
    await this.assertOrgOwner(existing.departmentId, requestingUserId);

    const patch: Record<string, unknown> = {};
    if (data.role !== undefined) patch.role = data.role;
    if (data.title !== undefined) patch.title = data.title.trim() || null;
    if (data.reportsTo !== undefined) patch.reports_to = data.reportsTo || null;

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .update(patch)
      .eq("id", id)
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kadro kaydı bulunamadı");
    return mapDepartmentMember(row);
  }

  private async findById(id: string): Promise<DepartmentMember> {
    const { data, error } = await this.supabase.client
      .from("department_members")
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kadro kaydı bulunamadı");
    return mapDepartmentMember(data);
  }

  // Davet edilen kişi kendisi onaylar/reddeder. E-posta ile davet edilmiş ama
  // henüz user_id bağlanmamışsa, onaylayan kişinin hesabıyla ilk burada eşleşir.
  async respond(id: string, approve: boolean, requestingUserId: string): Promise<DepartmentMember> {
    const existing = await this.findById(id);
    if (existing.userId && existing.userId !== requestingUserId) {
      throw new ForbiddenException("Bu daveti yalnızca davet edilen kişi yanıtlayabilir");
    }

    const patch: Record<string, unknown> = { status: approve ? "approved" : "rejected" };
    if (!existing.userId) patch.user_id = requestingUserId;

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .update(patch)
      .eq("id", id)
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kadro kaydı bulunamadı");

    const member = mapDepartmentMember(row);

    // Onaylandığında daveti gönderen kişiye anlık bildirim gider — link departman
    // sayfasına gider, orada açık olan liste soket üzerinden bunu görüp kendini
    // yeniler (bkz. DepartmentMembersList.tsx).
    if (approve && member.invitedBy) {
      void this.notificationsService.notifyUser(
        member.invitedBy,
        "member_joined",
        "Kadro Onayı",
        `${member.fullName ?? "Bir kullanıcı"} departman davetini onayladı ve kadroya katıldı.`,
        `/departments/${member.departmentId}`
      );
    }

    return member;
  }

  // İşten çıkarma / kadrodan ayrılma. accessUntil verilirse belirtilen tarihe kadar
  // sınırlı görünürlük tanınır (Doküman 1, işten çıkarma bölümü).
  async remove(id: string, accessUntil: string | undefined, requestingUserId?: string): Promise<DepartmentMember> {
    const existing = await this.findById(id);
    await this.assertOrgOwner(existing.departmentId, requestingUserId);

    const { data: row, error } = await this.supabase.client
      .from("department_members")
      .update({ status: "removed", access_until: accessUntil ?? null })
      .eq("id", id)
      // department_members'ın users'a iki ayrı FK'sı var (user_id, invited_by) —
      // PostgREST hangi ilişkiyi kastettiğimizi bilemiyor ve "birden fazla ilişki
      // bulundu" hatası veriyor (bu da NestJS'te yakalanmayan bir hata olarak 500'e
      // dönüşüyordu). FK adını açıkça belirterek belirsizliği kaldırıyoruz.
      .select("*, users!department_members_user_id_fkey(full_name, email, username)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kadro kaydı bulunamadı");
    return mapDepartmentMember(row);
  }
}
