import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ProjectPost } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { MembersService } from "../members/members.service";
import { DepartmentMembersService } from "../department-members/department-members.service";
import { NotificationsService } from "../notifications/notifications.service";
import { extractMentionHandles } from "../../common/mentions.util";
import { requireUuid } from "../../common/validation/input";
import { AKIS_TAVANI } from "../../common/liste-tavani";
import { ArkadaslarService } from "../arkadaslar/arkadaslar.service";
import { duvarPaylasiminiSilebilir } from "../arkadaslar/arkadaslik-durumu";

// Yazarın adı. project_posts'un users'a İKİ bağı var (user_id ve 134'ten beri
// wall_user_id); ipucu vermeden "users(...)" yazmak PostgREST'te belirsizlik
// hatası verir ve TÜM akışları düşürür. Bağ, sütun adıyla işaretleniyor.
const POST_SECIMI = "*, users!user_id(full_name)";
const DUVAR_SECIMI = "*, users!user_id(full_name), wall_owner:users!wall_user_id(full_name)";

function mapPost(
  row: any,
  likeCount: number,
  commentCount: number,
  likedByMe: boolean,
  sourceDepartmentName?: string,
  requestingUserId?: string
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
    wallUserId: row.wall_user_id ?? undefined,
    wallOwnerName: row.wall_user_id ? row.wall_owner?.full_name ?? undefined : undefined,
    canDelete:
      !!row.wall_user_id && !!requestingUserId && duvarPaylasiminiSilebilir(requestingUserId, row.user_id, row.wall_user_id),
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
  // Kişisel duvar (bkz. migration 134): paylaşım bu kullanıcının duvarında.
  wallUserId?: string;
}

/**
 * Bir paylaşım satırının kapsamı. Yorum/beğeni bildirimleri kapsamı buradan
 * çıkarıyor; yeni bir kapsam eklendiğinde üç ayrı yerde elle kurulan nesneler
 * birini unutuyordu.
 */
export function postScopeOf(row: any): PostScope {
  return {
    projectId: row.project_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    wallUserId: row.wall_user_id ?? undefined,
  };
}

@Injectable()
export class ProjectPostsService {
  constructor(
    private supabase: SupabaseService,
    private membersService: MembersService,
    private departmentMembersService: DepartmentMembersService,
    private notificationsService: NotificationsService,
    private arkadaslar: ArkadaslarService
  ) {}

  async findByProject(projectId: string, requestingUserId?: string): Promise<ProjectPost[]> {
    return this.findByScope({ projectId }, requestingUserId);
  }

  async findByDepartment(departmentId: string, requestingUserId?: string): Promise<ProjectPost[]> {
    return this.findByScope({ departmentId }, requestingUserId);
  }

  private async findByScope(scope: PostScope, requestingUserId?: string): Promise<ProjectPost[]> {
    // En yeniden eskiye sıralı, tavanlı: akış doğal olarak sınırsız büyüyor ve
    // eski gönderiler pratikte hiç görülmüyor (bkz. common/liste-tavani.ts).
    let query = this.supabase.client
      .from("project_posts")
      .select(POST_SECIMI)
      .order("created_at", { ascending: false })
      .limit(AKIS_TAVANI);
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

    let query = this.supabase.client
      .from("project_posts")
      .select(POST_SECIMI)
      .order("created_at", { ascending: false })
      .limit(AKIS_TAVANI);
    query =
      deptIds.length > 0
        // organizationId filtre metnine gömülüyor. Buraya gelmeden önce
        // assertCanViewOrganization'dan geçiyor (uydurma bir değer eşleşmez), ama
        // o kontrole bel bağlamayalım — gömülen değer her hâlükârda doğrulanır.
        // deptIds veritabanından geldiği için zaten güvenli.
        ? query.or(`organization_id.eq.${requireUuid(organizationId, "Organizasyon kimliği")},department_id.in.(${deptIds.join(",")})`)
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
        getSourceDepartmentName?.(row),
        requestingUserId
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

  // ------------------------------------------------------------ Kişisel duvar

  /**
   * Bir kullanıcının duvarı. Yetki (sahibi ya da arkadaşı) controller'da
   * AccessService.assertCanViewWall ile sorulmuş olmalı.
   */
  async findWall(wallUserId: string, requestingUserId: string): Promise<ProjectPost[]> {
    return this.findWalls([wallUserId], requestingUserId);
  }

  /**
   * Sosyal sayfanın akışı: benim ve arkadaşlarımın duvarları, tek zaman
   * çizelgesinde. Arkadaşımın, benim arkadaşım OLMAYAN birinin duvarına
   * yazdığı paylaşım burada yok — o duvarı göremiyorum.
   */
  async findSocialFeed(requestingUserId: string): Promise<ProjectPost[]> {
    const arkadaslar = await this.arkadaslar.arkadasIdleri(requestingUserId);
    return this.findWalls([requestingUserId, ...arkadaslar], requestingUserId);
  }

  private async findWalls(wallUserIds: string[], requestingUserId: string): Promise<ProjectPost[]> {
    const { data, error } = await this.supabase.client
      .from("project_posts")
      .select(DUVAR_SECIMI)
      .in("wall_user_id", wallUserIds)
      .order("created_at", { ascending: false })
      .limit(AKIS_TAVANI);
    if (error) throw error;
    return this.attachEngagement(data ?? [], requestingUserId);
  }

  /** Arkadaşının duvarına yazınca duvar sahibi haberdar edilir; kendi duvarına yazınca kimse. */
  async createOnWall(wallUserId: string, userId: string, body: string): Promise<ProjectPost> {
    const post = await this.createForScope({ wallUserId }, userId, body);
    if (wallUserId !== userId) {
      this.notificationsService.notifyUserSafe(
        wallUserId,
        "wall_post",
        "Duvarına bir paylaşım yazıldı",
        { metin: '{kisi} duvarına yazdı: "{alinti}"', params: { kisi: post.authorName, alinti: post.body.slice(0, 80) } },
        `/sosyal/${wallUserId}`
      );
    }
    return post;
  }

  /**
   * Yalnızca duvar paylaşımları silinebilir: yazan ya da duvarın sahibi.
   * Proje/departman/şirket akışlarında silme hiç olmadı; bu değişiklik onlara
   * dokunmuyor. Beğeni ve yorumlar ON DELETE CASCADE ile birlikte gider.
   */
  async deleteWallPost(postId: string, userId: string): Promise<void> {
    const { data: post } = await this.supabase.client
      .from("project_posts")
      .select("*")
      .eq("id", requireUuid(postId, "Paylaşım"))
      .maybeSingle();
    if (!post || !post.wall_user_id) throw new NotFoundException("Paylaşım bulunamadı");
    if (!duvarPaylasiminiSilebilir(userId, post.user_id, post.wall_user_id)) {
      throw new ForbiddenException("Bu paylaşımı yalnızca yazan ya da duvar sahibi silebilir");
    }
    const { error } = await this.supabase.client.from("project_posts").delete().eq("id", post.id);
    if (error) throw error;
  }

  private async createForScope(scope: PostScope, userId: string, body: string): Promise<ProjectPost> {
    const trimmed = (typeof body === "string" ? body : "").trim().slice(0, 140);
    if (!trimmed) throw new BadRequestException("Paylaşım boş olamaz");
    const { data: row, error } = await this.supabase.client
      .from("project_posts")
      .insert({
        project_id: scope.projectId ?? null,
        department_id: scope.departmentId ?? null,
        organization_id: scope.organizationId ?? null,
        // Anahtar yalnızca duvar paylaşımında yazılıyor: her zaman
        // `wall_user_id: null` göndermek, migration 134 uygulanmamış bir
        // veritabanında proje/departman paylaşımlarını da düşürürdü.
        ...(scope.wallUserId ? { wall_user_id: scope.wallUserId } : {}),
        user_id: userId,
        body: trimmed,
      })
      .select(scope.wallUserId ? DUVAR_SECIMI : POST_SECIMI)
      .single();
    if (error) throw error;

    await this.notifyMentions(scope, userId, trimmed);

    return mapPost(row, 0, 0, false, undefined, userId);
  }

  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    // "*": sütun listesi yazılsaydı migration 134 uygulanmadan (wall_user_id
    // yokken) beğeni tamamen çalışmazdı.
    const { data: post } = await this.supabase.client
      .from("project_posts")
      .select("*")
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
        const { members, link } = await this.resolveScopeMembers(postScopeOf(post));
        const actorName = members.find((m) => m.userId === userId)?.fullName ?? "Bir ekip üyesi";
        await this.notificationsService.notifyUser(post.user_id, "post_like", "Paylaşımın beğenildi", { metin: "{kisi} paylaşımını beğendi.", params: { kisi: actorName } }, link);
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
      await this.notificationsService.notifyUser(m.userId, "post_mention", "Bir paylaşımda etiketlendin", { metin: "{kisi} seni bir paylaşımda etiketledi.", params: { kisi: actorName } }, link);
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
    if (scope.wallUserId) {
      return this.resolveWallMembers(scope.wallUserId);
    }
    return { members: [] };
  }

  // Duvar için etiket/bildirim alıcıları: duvar sahibi + arkadaşları — yani tam
  // olarak o duvarı görebilenler. Duvarı göremeyen biri etiketlenemez.
  private async resolveWallMembers(wallUserId: string): Promise<{ members: ScopeActor[]; link?: string }> {
    const ids = [wallUserId, ...(await this.arkadaslar.arkadasIdleri(wallUserId))];
    const { data } = await this.supabase.client.from("users").select("id, full_name, username").in("id", ids);
    return {
      members: (data ?? []).map((u: any) => ({ userId: u.id, fullName: u.full_name, username: u.username })),
      link: `/sosyal/${wallUserId}`,
    };
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
