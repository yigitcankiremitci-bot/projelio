import { Injectable } from "@nestjs/common";
import type { PostComment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ProjectPostsService } from "../project-posts/project-posts.service";
import { NotificationsService } from "../notifications/notifications.service";
import { extractMentionHandles } from "../../common/mentions.util";

function mapComment(row: any, likeCount: number, likedByMe: boolean): PostComment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorName: row.users?.full_name ?? "Bilinmeyen kullanıcı",
    body: row.body,
    createdAt: row.created_at,
    likeCount,
    likedByMe,
  };
}

@Injectable()
export class PostCommentsService {
  constructor(
    private supabase: SupabaseService,
    // Proje ekibi / departman kadrosu ayrımını tek bir yerde tutan yardımcı
    // (bkz. ProjectPostsService.resolveScopeMembers) burada da kullanılıyor —
    // yorum bir paylaşıma bağlı, paylaşımın proje mi departman mı olduğuna göre
    // doğru ekibe bildirim gitmesi gerekiyor.
    private projectPostsService: ProjectPostsService,
    private notificationsService: NotificationsService
  ) {}

  async findByPost(postId: string, requestingUserId?: string): Promise<PostComment[]> {
    const { data, error } = await this.supabase.client
      .from("post_comments")
      .select("*, users(full_name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const commentIds = (data ?? []).map((r: any) => r.id);
    const likeCounts = new Map<string, number>();
    const likedCommentIds = new Set<string>();

    if (commentIds.length > 0) {
      const { data: likes } = await this.supabase.client
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", commentIds);
      for (const l of likes ?? []) {
        likeCounts.set(l.comment_id, (likeCounts.get(l.comment_id) ?? 0) + 1);
        if (requestingUserId && l.user_id === requestingUserId) likedCommentIds.add(l.comment_id);
      }
    }

    return (data ?? []).map((row: any) =>
      mapComment(row, likeCounts.get(row.id) ?? 0, likedCommentIds.has(row.id))
    );
  }

  async create(postId: string, userId: string, body: string): Promise<PostComment> {
    const trimmed = body.trim().slice(0, 500);
    const { data: row, error } = await this.supabase.client
      .from("post_comments")
      .insert({ post_id: postId, user_id: userId, body: trimmed })
      .select("*, users(full_name)")
      .single();
    if (error) throw error;
    const comment = mapComment(row, 0, false);

    void this.notifyPostAuthorAndMentions(postId, userId, trimmed);

    return comment;
  }

  async toggleLike(commentId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const { data: comment } = await this.supabase.client
      .from("post_comments")
      .select("user_id, post_id")
      .eq("id", commentId)
      .maybeSingle();

    const { data: existing } = await this.supabase.client
      .from("comment_likes")
      .select("id")
      .eq("comment_id", commentId)
      .eq("user_id", userId)
      .maybeSingle();

    let liked: boolean;
    if (existing) {
      await this.supabase.client.from("comment_likes").delete().eq("id", existing.id);
      liked = false;
    } else {
      await this.supabase.client.from("comment_likes").insert({ comment_id: commentId, user_id: userId });
      liked = true;

      if (comment && comment.user_id && comment.user_id !== userId) {
        const { data: post } = await this.supabase.client
          .from("project_posts")
          .select("project_id, department_id, organization_id")
          .eq("id", comment.post_id)
          .maybeSingle();
        if (post) {
          const { members, link } = await this.projectPostsService.resolveScopeMembers({
            projectId: post.project_id ?? undefined,
            departmentId: post.department_id ?? undefined,
            organizationId: post.organization_id ?? undefined,
          });
          const actorName = members.find((m) => m.userId === userId)?.fullName ?? "Bir ekip üyesi";
          await this.notificationsService.notifyUser(comment.user_id, "comment_like", "Yorumun beğenildi", `${actorName} yorumunu beğendi.`, link);
        }
      }
    }

    const { count } = await this.supabase.client
      .from("comment_likes")
      .select("id", { count: "exact", head: true })
      .eq("comment_id", commentId);

    return { liked, likeCount: count ?? 0 };
  }

  // Yorumu yapan kişi dışında paylaşımın sahibine, ve yorum metninde etiketlenen
  // "@kullaniciadi" ekip üyelerine/kadro üyelerine bildirim gönderir.
  private async notifyPostAuthorAndMentions(postId: string, actingUserId: string, body: string): Promise<void> {
    const { data: post } = await this.supabase.client
      .from("project_posts")
      .select("user_id, project_id, department_id, organization_id")
      .eq("id", postId)
      .maybeSingle();
    if (!post) return;

    const { members, link } = await this.projectPostsService.resolveScopeMembers({
      projectId: post.project_id ?? undefined,
      departmentId: post.department_id ?? undefined,
      organizationId: post.organization_id ?? undefined,
    });
    const actorName = members.find((m) => m.userId === actingUserId)?.fullName ?? "Bir ekip üyesi";

    if (post.user_id !== actingUserId) {
      await this.notificationsService.notifyUser(
        post.user_id,
        "post_comment",
        "Paylaşımına yorum yapıldı",
        `${actorName} paylaşımına yorum yaptı: "${body.slice(0, 80)}"`,
        link
      );
    }

    const handles = extractMentionHandles(body);
    if (handles.length === 0) return;
    const mentioned = members.filter(
      (m) => m.username && handles.includes(m.username.toLowerCase()) && m.userId !== actingUserId
    );
    for (const m of mentioned) {
      await this.notificationsService.notifyUser(m.userId, "post_mention", "Bir yorumda etiketlendin", `${actorName} seni bir yorumda etiketledi.`, link);
    }
  }
}
