import { Injectable, NotFoundException } from "@nestjs/common";
import type { Task } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    assignedTo: row.assigned_to ?? undefined,
    title: row.title,
    startDate: row.start_date ?? undefined,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
  };
}

@Injectable()
export class TasksService {
  constructor(private supabase: SupabaseService) {}

  async findByProject(projectId: string): Promise<Task[]> {
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select()
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapTask);
  }

  async create(projectId: string, data: Partial<Task>): Promise<Task> {
    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .insert({
        project_id: projectId,
        assigned_to: data.assignedTo ?? null,
        title: data.title ?? "",
        start_date: data.startDate ?? null,
        deadline: data.deadline ?? new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return mapTask(row);
  }

  async updateStatus(id: string, status: Task["status"]): Promise<Task> {
    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({ status })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    return mapTask(row);
  }

  async updateSchedule(id: string, startDate?: string, deadline?: string): Promise<Task> {
    const patch: Record<string, unknown> = {};
    if (startDate) patch.start_date = startDate;
    if (deadline) patch.deadline = deadline;

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    return mapTask(row);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client.from("tasks").delete().eq("id", id);
    if (error) throw error;
  }
}
