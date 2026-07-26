import { Injectable } from "@nestjs/common";
import type { TaskComment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { TasksService } from "../tasks/tasks.service";

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
  constructor(
    private supabase: SupabaseService,
    private tasksService: TasksService
  ) {}

  async findByTask(taskId: string): Promise<TaskComment[]> {
    const { data, error } = await this.supabase.client
      .from("task_comments")
      .select("*, users(full_name)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapComment);
  }

  // Projedeki tüm görev/alt görevlere yapılan yorumlar (Akış sekmesi için).
  // Çağıran taşeronsa (subcontractor), sadece kendisiyle ilgili görev/alt görevlere
  // ait yorumlar döner; diğer roller için davranış değişmez.
  async findByProject(projectId: string, requestingUserId?: string): Promise<(TaskComment & { taskTitle: string })[]> {
    const { data, error } = await this.supabase.client
      .from("task_comments")
      .select("*, users(full_name), tasks!inner(title, project_id)")
      .eq("tasks.project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const comments = (data ?? []).map((row: any) => ({ ...mapComment(row), taskTitle: row.tasks?.title ?? "" }));

    if (!requestingUserId) return comments;
    const visibleIds = await this.tasksService.getVisibleTaskIdsForSubcontractor(projectId, requestingUserId);
    if (!visibleIds) return comments;
    return comments.filter((c) => visibleIds.has(c.taskId));
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
