import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Output } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
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
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

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

  async create(projectId: string, data: Partial<Output>, createdBy?: string): Promise<Output> {
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
    const output = mapOutput(row);
    // Yeni çıktı eklendiğinde proje ekibine (ekleyen hariç) push/bildirim gitsin.
    void this.notifyTeamNewOutput(output, createdBy);
    return output;
  }

  private async notifyTeamNewOutput(output: Output, createdBy?: string): Promise<void> {
    try {
      const [{ data: project }, { data: members }] = await Promise.all([
        this.supabase.client.from("projects").select("owner_id").eq("id", output.projectId).maybeSingle(),
        this.supabase.client
          .from("project_members")
          .select("user_id")
          .eq("project_id", output.projectId)
          .eq("status", "approved"),
      ]);
      const recipients = new Set<string>();
      if (project?.owner_id) recipients.add(project.owner_id);
      for (const m of members ?? []) recipients.add(m.user_id);
      if (createdBy) recipients.delete(createdBy);
      await Promise.all(
        [...recipients].map((userId) =>
          this.notificationsService.notifyUser(
            userId,
            "task_updated",
            "Yeni Çıktı",
            `"${output.title}" çıktısı eklendi.`,
            `/projects/${output.projectId}`
          )
        )
      );
    } catch {
      // bildirim gönderilemese de çıktı oluşturma başarılı sayılır
    }
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
