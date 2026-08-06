import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Output } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { applyOrder } from "../../common/reorder.util";

function mapOutput(row: any): Output {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    departmentId: row.department_id ?? undefined,
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

  async findByDepartment(departmentId: string): Promise<Output[]> {
    const { data, error } = await this.supabase.client
      .from("outputs")
      .select()
      .eq("department_id", departmentId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapOutput);
  }

  // Departman kaynaklarını yalnızca organizasyon sahibi ya da o departmanın
  // onaylı bir kadro üyesi görebilir/yönetebilir (bkz. ModuleRecordsService ile aynı desen).
  private async assertDepartmentAccess(departmentId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (!dept) throw new NotFoundException("Departman bulunamadı");
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    if (org?.owner_id === userId) return;
    const { data: memberRow } = await this.supabase.client
      .from("department_members")
      .select("id")
      .eq("department_id", departmentId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (memberRow) return;
    throw new ForbiddenException("Bu departmanın çıktılarını yalnızca kadrosundaki kişiler yönetebilir");
  }

  async reorder(ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client
      .from("outputs")
      .select("id, project_id, department_id")
      .in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }
    const projectIds = new Set(rows.map((r: any) => r.project_id));
    const departmentIds = new Set(rows.map((r: any) => r.department_id));
    if (projectIds.size > 1 || departmentIds.size > 1) {
      throw new BadRequestException("Sıralanan çıktılar aynı projeye/departmana ait olmalı");
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

  async createForDepartment(departmentId: string, data: Partial<Output>, createdBy?: string): Promise<Output> {
    await this.assertDepartmentAccess(departmentId, createdBy);
    const { data: row, error } = await this.supabase.client
      .from("outputs")
      .insert({
        department_id: departmentId,
        title: data.title ?? "",
        description: data.description ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    const output = mapOutput(row);
    void this.notifyDepartmentTeamNewOutput(output, createdBy);
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

  private async notifyDepartmentTeamNewOutput(output: Output, createdBy?: string): Promise<void> {
    try {
      const { data: dept } = await this.supabase.client
        .from("departments")
        .select("organization_id")
        .eq("id", output.departmentId)
        .maybeSingle();
      const [{ data: org }, { data: members }] = await Promise.all([
        dept
          ? this.supabase.client.from("organizations").select("owner_id").eq("id", dept.organization_id).maybeSingle()
          : Promise.resolve({ data: null }),
        this.supabase.client
          .from("department_members")
          .select("user_id")
          .eq("department_id", output.departmentId)
          .eq("status", "approved"),
      ]);
      const recipients = new Set<string>();
      if (org?.owner_id) recipients.add(org.owner_id);
      for (const m of members ?? []) if (m.user_id) recipients.add(m.user_id);
      if (createdBy) recipients.delete(createdBy);
      await Promise.all(
        [...recipients].map((userId) =>
          this.notificationsService.notifyUser(
            userId,
            "task_updated",
            "Yeni Çıktı",
            `"${output.title}" çıktısı eklendi.`,
            `/departments/${output.departmentId}?tab=tasks`
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
