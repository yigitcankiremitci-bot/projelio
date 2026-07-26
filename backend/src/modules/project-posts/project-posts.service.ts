import { Injectable } from "@nestjs/common";
import type { ProjectPost } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { MembersService } from "../members/members.service";
import { NotificationsService } from "../notifications/notifications.service";
import { extractMentionHandles } from "../../common/mentions.util";

function mapPost(row: any, likeCount: number, commentCount: number, likedByMe: boolean): ProjectPost {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    authorName: row.users?.full_name ?? "Bilinmeyen kullanıcı",
    body: row.body,
    createdAt: row.created_at,
    likeCount,
    commentCount,
    likedByMe,
  };
}

@Injectable()
export class ProjectPostsService {
  constructor(
    private supabase: SupabaseService,
    private membersService: MembersService,
    private notificationsService: NotificationsService
  ) {}

  async findByProject(projectId: string, requestingUserId?: string): Promise<ProjectPost[]> {
    const { data, error } = await this.supabase.client
      .from("project_posts")
      .select("*, users(full_name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const postIds = (data ?? []).map((r: any) => r.id);
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

    return (data ?? []).map((row: any) =>
      mapPost(row, likeCounts.get(row.id) ?? 0, commentCounts.get(row.id) ?? 0, likedPostIds.has(row.id))
    );
  }

  async create(projectId: string, userId: string, body: string): Promise<ProjectPost> {
    const trimmed = body.trim().slice(0, 140);
    const { data: row, error } = await this.supabase.client
      .from("project_posts")
      .insert({ project_id: projectId, user_id: userId, body: trimmed })
      .select("*, users(full_name)")
      .single();
    if (error) throw error;

    await this.notifyMentions(projectId, userId, trimmed);

    return mapPost(row, 0, 0, false);
  }

  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const { data: post } = await this.supabase.client
      .from("project_posts")
      .select("user_id, project_id")
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
        const members = await this.membersService.findByProject(post.project_id);
        const actorName = members.find((m) => m.userId === userId)?.fullName ?? "Bir ekip üyesi";
        await this.notificationsService.notifyUser(
          post.user_id,
          "post_like",
          "Paylaşımın beğenildi",
          `${actorName} paylaşımını beğendi.`,
          `/projects/${post.project_id}`
        );
      }
    }

    const { count } = await this.supabase.client
      .from("post_likes")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId);

    return { liked, likeCount: count ?? 0 };
  }

  // Paylaşım metnindeki "@kullaniciadi" etiketlerini bulup ilgili proje üyelerine bildirim gönderir.
  private async notifyMentions(projectId: string, actingUserId: string, body: string): Promise<void> {
    const handles = extractMentionHandles(body);
    if (handles.length === 0) return;

    const members = await this.membersService.findByProject(projectId);
    const actorName = members.find((m) => m.userId === actingUserId)?.fullName ?? "Bir ekip üyesi";
    const mentioned = members.filter(
      (m) => m.username && handles.includes(m.username.toLowerCase()) && m.userId !== actingUserId
    );

    for (const m of mentioned) {
      await this.notificationsService.notifyUser(
        m.userId,
        "post_mention",
        "Bir paylaşımda etiketlendin",
        `${actorName} seni bir paylaşımda etiketledi.`,
        `/projects/${projectId}`
      );
    }
  }
}
