import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Task } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { applyOrder } from "../../common/reorder.util";

function mapTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    outputId: row.output_id ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    title: row.title,
    startDate: row.start_date ?? undefined,
    deadline: row.deadline,
    status: row.status,
    parentTaskId: row.parent_task_id ?? undefined,
    budget: row.budget != null ? Number(row.budget) : 0,
    budgetStatus: row.budget_status ?? "pending",
    weekNumber: row.week_number ?? undefined,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
    completedAt: row.completed_at ?? undefined,
    completedBy: row.completed_by ?? undefined,
    completedByName: row.completed_by_user?.full_name ?? undefined,
  };
}

@Injectable()
export class TasksService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  // requestingUserId verilirse ve bu kullanıcı projede taşeron (subcontractor) ise,
  // sonuç sadece kendisine atanmış görev/alt görevlerle sınırlandırılır.
  async findByProject(projectId: string, requestingUserId?: string): Promise<Task[]> {
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("*, completed_by_user:users!tasks_completed_by_fkey(full_name)")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    const tasks = (data ?? []).map(mapTask);

    if (!requestingUserId) return tasks;
    const visibleIds = await this.getVisibleTaskIdsForSubcontractor(projectId, requestingUserId);
    if (!visibleIds) return tasks;
    return tasks.filter((t) => visibleIds.has(t.id));
  }

  // Kullanıcının bu projedeki rolünü döner: proje sahibiyse "owner", project_members
  // kaydı varsa oradaki rol ("member" / "subcontractor" / "owner"), yoksa null.
  async getMembershipRole(projectId: string, userId: string): Promise<string | null> {
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (project?.owner_id === userId) return "owner";

    const { data: membership } = await this.supabase.client
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    return membership?.role ?? null;
  }

  // Kullanıcı bu projede taşeron değilse null döner (filtrelemeye gerek yok, tüm görevleri görebilir).
  // Taşeronsa: kendisine atanmış görev/alt görevlerin id'lerini, alt görevler ağaçta doğru
  // görünebilsin diye üst görevlerinin id'leriyle birlikte (sadece "kabuk" olarak) döner.
  async getVisibleTaskIdsForSubcontractor(projectId: string, userId: string): Promise<Set<string> | null> {
    const role = await this.getMembershipRole(projectId, userId);
    if (role !== "subcontractor") return null;

    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("id, assigned_to, parent_task_id")
      .eq("project_id", projectId);
    if (error) throw error;
    const rows = data ?? [];

    const assignedIds = new Set(rows.filter((r: any) => r.assigned_to === userId).map((r: any) => r.id as string));
    const parentIds = new Set(
      rows
        .filter((r: any) => assignedIds.has(r.id) && r.parent_task_id)
        .map((r: any) => r.parent_task_id as string)
    );
    return new Set([...assignedIds, ...parentIds]);
  }

  async create(projectId: string, data: Partial<Task>): Promise<Task> {
    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .insert({
        project_id: projectId,
        output_id: data.outputId ?? null,
        assigned_to: data.assignedTo ?? null,
        title: data.title ?? "",
        start_date: data.startDate ?? null,
        deadline: data.deadline ?? new Date().toISOString(),
        status: data.status ?? "todo",
        parent_task_id: data.parentTaskId ?? null,
        budget: data.budget ?? 0,
        week_number: data.weekNumber ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    const task = mapTask(row);
    if (task.assignedTo) {
      void this.notificationsService.notifyUser(
        task.assignedTo,
        "task_assigned",
        "Yeni Görev Atandı",
        `"${task.title}" görevine atandınız.`,
        `/projects/${task.projectId}`
      );
    }
    return task;
  }

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const { data: existingRow } = await this.supabase.client.from("tasks").select().eq("id", id).maybeSingle();
    const previous = existingRow ? mapTask(existingRow) : null;

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.startDate !== undefined) patch.start_date = data.startDate || null;
    if (data.deadline !== undefined) patch.deadline = data.deadline;
    if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo || null;
    if (data.budget !== undefined) {
      patch.budget = data.budget;
      patch.budget_status = "pending";
    }
    if (data.weekNumber !== undefined) patch.week_number = data.weekNumber;
    if (data.outputId !== undefined) patch.output_id = data.outputId;

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    const task = mapTask(row);

    if (task.assignedTo && task.assignedTo !== previous?.assignedTo) {
      void this.notificationsService.notifyUser(
        task.assignedTo,
        "task_assigned",
        "Yeni Görev Atandı",
        `"${task.title}" görevine atandınız.`,
        `/projects/${task.projectId}`
      );
    } else if (
      task.assignedTo &&
      previous &&
      (previous.title !== task.title || previous.deadline !== task.deadline || previous.startDate !== task.startDate)
    ) {
      void this.notificationsService.notifyUser(
        task.assignedTo,
        "task_updated",
        "Görev Güncellendi",
        `"${task.title}" görevinde güncelleme var.`,
        `/projects/${task.projectId}`
      );
    }
    return task;
  }

  async updateBudgetStatus(id: string, budgetStatus: Task["budgetStatus"]): Promise<Task> {
    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({ budget_status: budgetStatus })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    return mapTask(row);
  }

  async updateStatus(id: string, status: Task["status"], requestingUserId?: string): Promise<Task> {
    // "Bugün yapılanlar" gibi ekip aktivite özetlerinde kimin ne zaman
    // tamamladığını gösterebilmek için, tamamlanınca damga atıyor,
    // geri alınırsa temizliyoruz.
    const patch: Record<string, unknown> =
      status === "completed"
        ? { status, completed_at: new Date().toISOString(), completed_by: requestingUserId ?? null }
        : { status, completed_at: null, completed_by: null };

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select("*, completed_by_user:users!tasks_completed_by_fkey(full_name)")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    const task = mapTask(row);
    if (task.assignedTo) {
      void this.notificationsService.notifyUser(
        task.assignedTo,
        "task_updated",
        "Görev Güncellendi",
        `"${task.title}" görevinin durumu değişti.`,
        `/projects/${task.projectId}`
      );
    }
    return task;
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
    const task = mapTask(row);
    if (task.assignedTo) {
      void this.notificationsService.notifyUser(
        task.assignedTo,
        "task_updated",
        "Görev Güncellendi",
        `"${task.title}" görevinin tarihi değişti.`,
        `/projects/${task.projectId}`
      );
    }
    return task;
  }

  // Kullanıcının "üzerinde çalışıyorum" durumunu ayarlar. Aktif edildiğinde önceki
  // aktif görevinin yerine geçer (bir kullanıcının tek anda tek aktif görevi olabilir).
  async setActiveWorker(userId: string, taskId: string, active: boolean): Promise<{ activeTaskId: string | null }> {
    const { error } = await this.supabase.client
      .from("users")
      .update({ active_task_id: active ? taskId : null })
      .eq("id", userId);
    if (error) throw error;
    const activeTaskId = active ? taskId : null;
    this.notificationsService.broadcastActiveWorker(userId, activeTaskId);
    return { activeTaskId };
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client.from("tasks").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string): Promise<Task> {
    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");

    // Bu görevin varsa tüm alt görevlerini de arşivle
    await this.supabase.client
      .from("tasks")
      .update({ archived_at: new Date().toISOString() })
      .eq("parent_task_id", id);

    return mapTask(row);
  }

  async restore(id: string): Promise<Task> {
    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({ archived_at: null })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");

    // Bu görevin varsa tüm alt görevlerini de geri getir
    await this.supabase.client.from("tasks").update({ archived_at: null }).eq("parent_task_id", id);

    return mapTask(row);
  }

  async reorder(ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client.from("tasks").select("id, project_id, parent_task_id").in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }

    const projectIds = new Set(rows.map((r: any) => r.project_id));
    if (projectIds.size > 1) {
      throw new BadRequestException("Sıralanan görevler aynı projeye ait olmalı");
    }
    // Ya hepsi aynı üst görevin altındaki alt görevler, ya da hepsi üst seviye görevler olmalı.
    const parentIds = new Set(rows.map((r: any) => r.parent_task_id ?? null));
    if (parentIds.size > 1) {
      throw new BadRequestException("Sıralanan görevler aynı üst göreve/sütuna ait olmalı");
    }

    await applyOrder(this.supabase.client, "tasks", ids);
  }
}
