import { Injectable } from "@nestjs/common";
import type { ProjectPost } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { MembersService } from "../members/members.service";
import { DepartmentMembersService } from "../department-members/department-members.service";
import { NotificationsService } from "../notifications/notifications.service";
import { extractMentionHandles } from "../../common/mentions.util";

function mapPost(
  row: any,
  likeCount: number,
  commentCount: number,
  likedByMe: boolean,
  sourceDepartmentName?: string
): ProjectPost {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    sourceDepartmentName,
    userId: row.user_id,
    authorName: row.users?.full_name ?? "Bilinmeyen kullanıcı",
    body: row.body,
    createdAt: row.created_at,
    likeCount,
    commentCount,
    likedByMe,
  };
}

// Sosyal bildirimlerinde "kim etiketlendi/kim beğendi" tespiti proje ekibi ile
// departman kadrosu arasında ortak kullanılabilsin diye sadeleştirilmiş şekil.
interface ScopeActor {
  userId: string;
  fullName?: string;
  username?: string;
}

interface PostScope {
  projectId?: string;
  departmentId?: string;
  organizationId?: string;
}

@Injectable()
export class ProjectPostsService {
  constructor(
    private supabase: SupabaseService,
    private membersService: MembersService,
    private departmentMembersService: DepartmentMembersService,
    private notificationsService: NotificationsService
  ) {}

  async findByProject(projectId: string, requestingUserId?: string): Promise<ProjectPost[]> {
    return this.findByScope({ projectId }, requestingUserId);
  }

  async findByDepartment(departmentId: string, requestingUserId?: string): Promise<ProjectPost[]> {
    return this.findByScope({ departmentId }, requestingUserId);
  }

  private async findByScope(scope: PostScope, requestingUserId?: string): Promise<ProjectPost[]> {
    let query = this.supabase.client.from("project_posts").select("*, users(full_name)").order("created_at", { ascending: false });
    query = scope.departmentId ? query.eq("department_id", scope.departmentId) : query.eq("project_id", scope.projectId!);
    const { data, error } = await query;
    if (error) throw error;
    return this.attachEngagement(data ?? [], requestingUserId);
  }

  // Şirket/işletme anasayfasındaki "Sosyal" sekmesi: organizasyona DOĞRUDAN yapılmış
  // paylaşımlar (organization_id = orgId) + organizasyona bağlı TÜM departmanların
  // akışları (department_id IN deptIds) tek bir zaman çizelgesinde birleşir. Hangi
  // departmandan geldiği (varsa) sourceDepartmentName ile işaretlenir ki istemci
  // paylaşımın kaynağını gösterebilsin.
  async findByOrganization(organizationId: string, requestingUserId?: string): Promise<ProjectPost[]> {
    const { data: depts, error: deptsError } = await this.supabase.client
      .from("departments")
      .select("id, name")
      .eq("organization_id", organizationId);
    if (deptsError) throw deptsError;
    const deptIds = (depts ?? []).map((d: any) => d.id);
    const deptNameById = new Map<string, string>((depts ?? []).map((d: any) => [d.id, d.name]));

    let query = this.supabase.client.from("project_posts").select("*, users(full_name)").order("created_at", { ascending: false });
    query =
      deptIds.length > 0
        ? query.or(`organization_id.eq.${organizationId},department_id.in.(${deptIds.join(",")})`)
        : query.eq("organization_id", organizationId);
    const { data, error } = await query;
    if (error) throw error;

    return this.attachEngagement(data ?? [], requestingUserId, (row) =>
      row.department_id ? deptNameById.get(row.department_id) : undefined
    );
  }

  private async attachEngagement(
    rows: any[],
    requestingUserId?: string,
    getSourceDepartmentName?: (row: any) => string | undefined
  ): Promise<ProjectPost[]> {
    const postIds = rows.map((r: any) => r.id);
    const likeCounts = new Map<string, number>();
    const commentCounts = new Map<string, number>();
    const likedPostIds = new Set<string>();

    if (postIds.length > 0) {
      const { data: likes } = await this.supabase.client
        .from("post_likes")
        .select("post_id, user_id")
        .in("post_id", postIds);
      for (const l of likes ?? []) {
        likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1);
        if (requestingUserId && l.user_id === requestingUserId) likedPostIds.add(l.post_id);
      }

      const { data: postComments } = await this.supabase.client
        .from("post_comments")
        .select("post_id")
        .in("post_id", postIds);
      for (const cm of postComments ?? []) {
        commentCounts.set(cm.post_id, (commentCounts.get(cm.post_id) ?? 0) + 1);
      }
    }

    return rows.map((row: any) =>
      mapPost(
        row,
        likeCounts.get(row.id) ?? 0,
        commentCounts.get(row.id) ?? 0,
        likedPostIds.has(row.id),
        getSourceDepartmentName?.(row)
      )
    );
  }

  async create(projectId: string, userId: string, body: string): Promise<ProjectPost> {
    return this.createForScope({ projectId }, userId, body);
  }

  async createForDepartment(departmentId: string, userId: string, body: string): Promise<ProjectPost> {
    return this.createForScope({ departmentId }, userId, body);
  }

  // Şirket anasayfasındaki "Sosyal" sekmesinden doğrudan organizasyona (herhangi bir
  // departmana bağlı olmadan) yapılan paylaşım.
  async createForOrganization(organizationId: string, userId: string, body: string): Promise<ProjectPost> {
    return this.createForScope({ organizationId }, userId, body);
  }

  private async createForScope(scope: PostScope, userId: string, body: string): Promise<ProjectPost> {
    const trimmed = body.trim().slice(0, 140);
    const { data: row, error } = await this.supabase.client
      .from("project_posts")
      .insert({
        project_id: scope.projectId ?? null,
        department_id: scope.departmentId ?? null,
        organization_id: scope.organizationId ?? null,
        user_id: userId,
        body: trimmed,
      })
      .select("*, users(full_name)")
      .single();
    if (error) throw error;

    await this.notifyMentions(scope, userId, trimmed);

    return mapPost(row, 0, 0, false);
  }

  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const { data: post } = await this.supabase.client
      .from("project_posts")
      .select("user_id, project_id, department_id, organization_id")
      .eq("id", postId)
      .maybeSingle();

    const { data: existing } = await this.supabase.client
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    let liked: boolean;
    if (existing) {
      await this.supabase.client.from("post_likes").delete().eq("id", existing.id);
      liked = false;
    } else {
      await this.supabase.client.from("post_likes").insert({ post_id: postId, user_id: userId });
      liked = true;

      if (post && post.user_id !== userId) {
        const { members, link } = await this.resolveScopeMembers({
          projectId: post.project_id ?? undefined,
          departmentId: post.department_id ?? undefined,
          organizationId: post.organization_id ?? undefined,
        });
        const actorName = members.find((m) => m.userId === userId)?.fullName ?? "Bir ekip üyesi";
        await this.notificationsService.notifyUser(post.user_id, "post_like", "Paylaşımın beğenildi", `${actorName} paylaşımını beğendi.`, link);
      }
    }

    const { count } = await this.supabase.client
      .from("post_likes")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId);

    return { liked, likeCount: count ?? 0 };
  }

  // Paylaşım metnindeki "@kullaniciadi" etiketlerini bulup ilgili proje üyelerine/departman
  // kadrosuna bildirim gönderir.
  private async notifyMentions(scope: PostScope, actingUserId: string, body: string): Promise<void> {
    const handles = extractMentionHandles(body);
    if (handles.length === 0) return;

    const { members, link } = await this.resolveScopeMembers(scope);
    const actorName = members.find((m) => m.userId === actingUserId)?.fullName ?? "Bir ekip üyesi";
    const mentioned = members.filter(
      (m) => m.username && handles.includes(m.username.toLowerCase()) && m.userId !== actingUserId
    );

    for (const m of mentioned) {
      await this.notificationsService.notifyUser(m.userId, "post_mention", "Bir paylaşımda etiketlendin", `${actorName} seni bir paylaşımda etiketledi.`, link);
    }
  }

  // Proje ekibi ile departman kadrosunu tek bir şekle indirger (bildirim
  // alıcıları + bildirim linki) — post-comments.service.ts'de de kullanılır.
  async resolveScopeMembers(scope: PostScope): Promise<{ members: ScopeActor[]; link?: string }> {
    if (scope.departmentId) {
      const members = await this.departmentMembersService.findByDepartment(scope.departmentId);
      return {
        members: members
          .filter((m) => m.status === "approved" && m.userId)
          .map((m) => ({ userId: m.userId as string, fullName: m.fullName, username: m.username })),
        link: `/departments/${scope.departmentId}?tab=flow`,
      };
    }
    if (scope.projectId) {
      const members = await this.membersService.findByProject(scope.projectId);
      return {
        members: members.map((m) => ({ userId: m.userId, fullName: m.fullName, username: m.username })),
        link: `/projects/${scope.projectId}`,
      };
    }
    if (scope.organizationId) {
      return this.resolveOrganizationMembers(scope.organizationId);
    }
    return { members: [] };
  }

  // Organizasyon akışı için etiket/bildirim alıcı listesi: organizasyona bağlı TÜM
  // departmanların onaylı kadrosu + organizasyon sahibi (dedupe edilmiş).
  private async resolveOrganizationMembers(organizationId: string): Promise<{ members: ScopeActor[]; link?: string }> {
    const { data: depts } = await this.supabase.client.from("departments").select("id").eq("organization_id", organizationId);
    const deptIds = (depts ?? []).map((d: any) => d.id);

    const deptMemberLists = await Promise.all(deptIds.map((id: string) => this.departmentMembersService.findByDepartment(id)));
    const deptActors: ScopeActor[] = deptMemberLists
      .flat()
      .filter((m) => m.status === "approved" && m.userId)
      .map((m) => ({ userId: m.userId as string, fullName: m.fullName, username: m.username }));

    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id, users(full_name, username)")
      .eq("id", organizationId)
      .maybeSingle();
    const ownerActor: ScopeActor[] = org?.owner_id
      ? [{ userId: org.owner_id, fullName: (org as any).users?.full_name, username: (org as any).users?.username }]
      : [];

    const byId = new Map<string, ScopeActor>();
    for (const a of [...ownerActor, ...deptActors]) byId.set(a.userId, a);

    return { members: Array.from(byId.values()), link: `/organizations/${organizationId}?tab=flow` };
  }
}
