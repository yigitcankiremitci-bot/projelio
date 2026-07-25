import { Injectable, NotFoundException } from "@nestjs/common";
import type { Project } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapProject(row: any): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? undefined,
    totalBudget: Number(row.total_budget),
    startDate: row.start_date,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
  };
}

@Injectable()
export class ProjectsService {
  constructor(private supabase: SupabaseService) {}

  async findAllForUser(userId: string): Promise<Project[]> {
    const { data, error } = await this.supabase.client
      .from("projects")
      .select()
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapProject);
  }

  async findOne(id: string): Promise<Project> {
    const { data, error } = await this.supabase.client
      .from("projects")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Proje bulunamadı");
    return mapProject(data);
  }

  async create(ownerId: string, data: Partial<Project>): Promise<Project> {
    const { data: row, error } = await this.supabase.client
      .from("projects")
      .insert({
        owner_id: ownerId,
        title: data.title ?? "",
        description: data.description ?? null,
        total_budget: data.totalBudget ?? 0,
        start_date: (data.startDate ?? new Date().toISOString()).slice(0, 10),
        deadline: (data.deadline ?? new Date().toISOString()).slice(0, 10),
      })
      .select()
      .single();
    if (error) throw error;
    return mapProject(row);
  }

  async update(id: string, data: Partial<Project>): Promise<Project> {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.totalBudget !== undefined) patch.total_budget = data.totalBudget;
    if (data.startDate !== undefined) patch.start_date = data.startDate.slice(0, 10);
    if (data.deadline !== undefined) patch.deadline = data.deadline.slice(0, 10);
    if (data.status !== undefined) patch.status = data.status;

    const { data: row, error } = await this.supabase.client
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Proje bulunamadı");
    return mapProject(row);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client.from("projects").delete().eq("id", id);
    if (error) throw error;
  }
}
