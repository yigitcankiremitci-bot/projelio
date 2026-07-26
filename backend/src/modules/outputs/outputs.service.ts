import { Injectable, NotFoundException } from "@nestjs/common";
import type { Output } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapOutput(row: any): Output {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

@Injectable()
export class OutputsService {
  constructor(private supabase: SupabaseService) {}

  async findByProject(projectId: string): Promise<Output[]> {
    const { data, error } = await this.supabase.client
      .from("outputs")
      .select()
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapOutput);
  }

  async create(projectId: string, data: Partial<Output>): Promise<Output> {
    const { data: row, error } = await this.supabase.client
      .from("outputs")
      .insert({
        project_id: projectId,
        title: data.title ?? "",
        description: data.description ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return mapOutput(row);
  }

  async update(id: string, data: Partial<Output>): Promise<Output> {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;

    const { data: row, error } = await this.supabase.client
      .from("outputs")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Çıktı bulunamadı");
    return mapOutput(row);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client.from("outputs").delete().eq("id", id);
    if (error) throw error;
  }
}
