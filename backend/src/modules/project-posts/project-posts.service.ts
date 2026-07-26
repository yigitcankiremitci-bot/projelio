import { Injectable } from "@nestjs/common";
import type { ProjectPost } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapPost(row: any): ProjectPost {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    authorName: row.users?.full_name ?? "Bilinmeyen kullanıcı",
    body: row.body,
    createdAt: row.created_at,
  };
}

@Injectable()
export class ProjectPostsService {
  constructor(private supabase: SupabaseService) {}

  async findByProject(projectId: string): Promise<ProjectPost[]> {
    const { data, error } = await this.supabase.client
      .from("project_posts")
      .select("*, users(full_name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPost);
  }

  async create(projectId: string, userId: string, body: string): Promise<ProjectPost> {
    const trimmed = body.trim().slice(0, 140);
    const { data: row, error } = await this.supabase.client
      .from("project_posts")
      .insert({ project_id: projectId, user_id: userId, body: trimmed })
      .select("*, users(full_name)")
      .single();
    if (error) throw error;
    return mapPost(row);
  }
}
