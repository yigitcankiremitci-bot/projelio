import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Output } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { applyOrder } from "../../common/reorder.util";

function mapOutput(row: any): Output {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
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
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapOutput);
  }

  async reorder(ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client.from("outputs").select("id, project_id").in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    const projectIds = new Set(rows.map((r: any) => r.project_id));
    if (projectIds.size > 1) {
      throw new BadRequestException("Sıralanan çıktılar aynı projeye ait olmalı");
    }
    await applyOrder(this.supabase.client, "outputs", ids);
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

  async archive(id: string): Promise<Output> {
    const { data: row, error } = await this.supabase.client
      .from("outputs")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Çıktı bulunamadı");
    return mapOutput(row);
  }

  async restore(id: string): Promise<Output> {
    const { data: row, error } = await this.supabase.client
      .from("outputs")
      .update({ archived_at: null })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Çıktı bulunamadı");
    return mapOutput(row);
  }
}
