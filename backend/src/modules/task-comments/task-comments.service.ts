import { Injectable } from "@nestjs/common";
import type { TaskComment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapComment(row: any): TaskComment {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    authorName: row.users?.full_name ?? "Bilinmeyen kullanıcı",
    body: row.body,
    createdAt: row.created_at,
  };
}

@Injectable()
export class TaskCommentsService {
  constructor(private supabase: SupabaseService) {}

  async findByTask(taskId: string): Promise<TaskComment[]> {
    const { data, error } = await this.supabase.client
      .from("task_comments")
      .select("*, users(full_name)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapComment);
  }

  // Projedeki tüm görev/alt görevlere yapılan yorumlar (Akış sekmesi için)
  async findByProject(projectId: string): Promise<(TaskComment & { taskTitle: string })[]> {
    const { data, error } = await this.supabase.client
      .from("task_comments")
      .select("*, users(full_name), tasks!inner(title, project_id)")
      .eq("tasks.project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ ...mapComment(row), taskTitle: row.tasks?.title ?? "" }));
  }

  async create(taskId: string, userId: string, body: string): Promise<TaskComment> {
    const { data: row, error } = await this.supabase.client
      .from("task_comments")
      .insert({ task_id: taskId, user_id: userId, body })
      .select("*, users(full_name)")
      .single();
    if (error) throw error;
    return mapComment(row);
  }
}
