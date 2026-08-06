import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Task } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { applyOrder } from "../../common/reorder.util";

function mapTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    outputId: row.output_id ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    assignedToName: row.assigned_user?.full_name ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    startDate: row.start_date ?? undefined,
    deadline: row.deadline,
    status: row.status,
    parentTaskId: row.parent_task_id ?? undefined,
    budget: row.budget != null ? Number(row.budget) : 0,
    budgetStatus: row.budget_status ?? "pending",
    weekNumber: row.week_number ?? undefined,
    estimatedDurationValue: row.estimated_duration_value != null ? Number(row.estimated_duration_value) : undefined,
    estimatedDurationUnit: row.estimated_duration_unit ?? undefined,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
    completedAt: row.completed_at ?? undefined,
    completedBy: row.completed_by ?? undefined,
    completedByName: row.completed_by_user?.full_name ?? undefined,
    projectTitle: row.projects?.title ?? undefined,
  };
}

// Görevin bildirim/bağlantı hedefi: proje ya da departman görevi olmasına göre değişir.
function taskLink(task: Task): string | undefined {
  if (task.projectId) return `/projects/${task.projectId}`;
  if (task.departmentId) return `/departments/${task.departmentId}?tab=tasks`;
  return undefined;
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
      .select(
        "*, completed_by_user:users!tasks_completed_by_fkey(full_name), assigned_user:users!tasks_assigned_to_fkey(full_name), projects(title)"
      )
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

  async findByDepartment(departmentId: string): Promise<Task[]> {
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select(
        "*, completed_by_user:users!tasks_completed_by_fkey(full_name), assigned_user:users!tasks_assigned_to_fkey(full_name)"
      )
      .eq("department_id", departmentId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapTask);
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
    throw new ForbiddenException("Bu departmanın görevlerini yalnızca kadrosundaki kişiler yönetebilir");
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

  // Bildirimlerde "atayan" kişinin adı da görünsün diye kullanıcı adını çeker.
  private async getUserName(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const { data } = await this.supabase.client.from("users").select("full_name").eq("id", userId).maybeSingle();
    return data?.full_name ?? null;
  }

  // Görevin ait olduğu proje/departman ekibinin id'lerini + bildirim linkini döner.
  private async getScopeRecipientsAndLink(task: Task): Promise<{ recipients: Set<string>; link?: string }> {
    if (task.projectId) {
      const [{ data: project }, { data: members }] = await Promise.all([
        this.supabase.client.from("projects").select("owner_id").eq("id", task.projectId).maybeSingle(),
        this.supabase.client.from("project_members").select("user_id").eq("project_id", task.projectId).eq("status", "approved"),
      ]);
      const recipients = new Set<string>();
      if (project?.owner_id) recipients.add(project.owner_id);
      for (const m of members ?? []) recipients.add(m.user_id);
      return { recipients, link: taskLink(task) };
    }
    if (task.departmentId) {
      const { data: dept } = await this.supabase.client
        .from("departments")
        .select("organization_id")
        .eq("id", task.departmentId)
        .maybeSingle();
      const [{ data: org }, { data: members }] = await Promise.all([
        dept
          ? this.supabase.client.from("organizations").select("owner_id").eq("id", dept.organization_id).maybeSingle()
          : Promise.resolve({ data: null }),
        this.supabase.client.from("department_members").select("user_id").eq("department_id", task.departmentId).eq("status", "approved"),
      ]);
      const recipients = new Set<string>();
      if (org?.owner_id) recipients.add(org.owner_id);
      for (const m of members ?? []) if (m.user_id) recipients.add(m.user_id);
      return { recipients, link: taskLink(task) };
    }
    return { recipients: new Set() };
  }

  async create(projectId: string, data: Partial<Task>, requestingUserId?: string): Promise<Task> {
    // Yeni görev/alt görev her zaman kendi listesinin EN ALTINA eklensin:
    // kardeşleri arasındaki en büyük sort_order'ın bir fazlasını alır. (Önceden
    // varsayılan 0 aldığı için son eklenen alt görev rastgele bir yere gidiyordu.)
    let nextSortOrder = 0;
    {
      let query = this.supabase.client
        .from("tasks")
        .select("sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: false })
        .limit(1);
      query = data.parentTaskId ? query.eq("parent_task_id", data.parentTaskId) : query.is("parent_task_id", null);
      const { data: maxRows } = await query;
      nextSortOrder = ((maxRows?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    }

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .insert({
        sort_order: nextSortOrder,
        project_id: projectId,
        output_id: data.outputId ?? null,
        assigned_to: data.assignedTo ?? null,
        title: data.title ?? "",
        description: data.description ?? null,
        start_date: data.startDate ?? null,
        deadline: data.deadline ?? new Date().toISOString(),
        status: data.status ?? "todo",
        parent_task_id: data.parentTaskId ?? null,
        budget: data.budget ?? 0,
        week_number: data.weekNumber ?? null,
        estimated_duration_value: data.estimatedDurationValue ?? null,
        estimated_duration_unit: data.estimatedDurationUnit ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    const task = mapTask(row);
    if (task.assignedTo && task.assignedTo !== requestingUserId) {
      void this.getUserName(requestingUserId).then((assigner) =>
        this.notificationsService.notifyUser(
          task.assignedTo!,
          "task_assigned",
          "Yeni Görev Atandı",
          assigner
            ? `${assigner}, sizi "${task.title}" görevine atadı.`
            : `"${task.title}" görevine atandınız.`,
          taskLink(task)
        )
      );
    }
    // Yeni görev eklendiğinde (alt görevler hariç) proje ekibine push/bildirim gitsin.
    if (!task.parentTaskId) {
      void this.notifyTeamNewTask(task, requestingUserId);
    }
    return task;
  }

  async createForDepartment(departmentId: string, data: Partial<Task>, requestingUserId?: string): Promise<Task> {
    await this.assertDepartmentAccess(departmentId, requestingUserId);

    let nextSortOrder = 0;
    {
      let query = this.supabase.client
        .from("tasks")
        .select("sort_order")
        .eq("department_id", departmentId)
        .order("sort_order", { ascending: false })
        .limit(1);
      query = data.parentTaskId ? query.eq("parent_task_id", data.parentTaskId) : query.is("parent_task_id", null);
      const { data: maxRows } = await query;
      nextSortOrder = ((maxRows?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    }

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .insert({
        sort_order: nextSortOrder,
        department_id: departmentId,
        output_id: data.outputId ?? null,
        assigned_to: data.assignedTo ?? null,
        title: data.title ?? "",
        description: data.description ?? null,
        start_date: data.startDate ?? null,
        deadline: data.deadline ?? new Date().toISOString(),
        status: data.status ?? "todo",
        parent_task_id: data.parentTaskId ?? null,
        budget: data.budget ?? 0,
        week_number: data.weekNumber ?? null,
        estimated_duration_value: data.estimatedDurationValue ?? null,
        estimated_duration_unit: data.estimatedDurationUnit ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    const task = mapTask(row);
    if (task.assignedTo && task.assignedTo !== requestingUserId) {
      void this.getUserName(requestingUserId).then((assigner) =>
        this.notificationsService.notifyUser(
          task.assignedTo!,
          "task_assigned",
          "Yeni Görev Atandı",
          assigner
            ? `${assigner}, sizi "${task.title}" görevine atadı.`
            : `"${task.title}" görevine atandınız.`,
          taskLink(task)
        )
      );
    }
    if (!task.parentTaskId) {
      void this.notifyTeamNewTask(task, requestingUserId);
    }
    return task;
  }

  // Proje/departman sahibi + onaylı üyelere (ekleyen ve zaten ayrıca bilgilendirilen atanan hariç)
  // "yeni görev eklendi" bildirimi gönderir.
  private async notifyTeamNewTask(task: Task, createdBy?: string): Promise<void> {
    try {
      const [{ recipients, link }, creatorName] = await Promise.all([
        this.getScopeRecipientsAndLink(task),
        this.getUserName(createdBy),
      ]);
      if (createdBy) recipients.delete(createdBy);
      if (task.assignedTo) recipients.delete(task.assignedTo);

      const body = creatorName
        ? `${creatorName}, "${task.title}" görevini ekledi.`
        : `"${task.title}" görevi eklendi.`;
      await Promise.all(
        [...recipients].map((userId) => this.notificationsService.notifyUser(userId, "task_updated", "Yeni Görev", body, link))
      );
    } catch {
      // bildirim gönderilemese de görev oluşturma başarılı sayılır
    }
  }

  async update(id: string, data: Partial<Task>, requestingUserId?: string): Promise<Task> {
    const { data: existingRow } = await this.supabase.client.from("tasks").select().eq("id", id).maybeSingle();
    const previous = existingRow ? mapTask(existingRow) : null;

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.startDate !== undefined) patch.start_date = data.startDate || null;
    if (data.deadline !== undefined) patch.deadline = data.deadline;
    if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo || null;
    if (data.budget !== undefined) {
      patch.budget = data.budget;
      patch.budget_status = "pending";
    }
    if (data.weekNumber !== undefined) patch.week_number = data.weekNumber;
    if (data.outputId !== undefined) patch.output_id = data.outputId;
    // İkisi birlikte gönderilir (bkz. TaskEditModal/CreateTaskModal): DB'de "biri
    // varsa diğeri de olmalı" kısıtı var, bu yüzden tek tek değil çift olarak set edilir.
    if (data.estimatedDurationValue !== undefined || data.estimatedDurationUnit !== undefined) {
      patch.estimated_duration_value = data.estimatedDurationValue ?? null;
      patch.estimated_duration_unit = data.estimatedDurationUnit ?? null;
    }

    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select(
        "*, completed_by_user:users!tasks_completed_by_fkey(full_name), assigned_user:users!tasks_assigned_to_fkey(full_name), projects(title)"
      )
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    const task = mapTask(row);

    if (task.assignedTo && task.assignedTo !== previous?.assignedTo && task.assignedTo !== requestingUserId) {
      void this.getUserName(requestingUserId).then((assigner) =>
        this.notificationsService.notifyUser(
          task.assignedTo!,
          "task_assigned",
          "Yeni Görev Atandı",
          assigner
            ? `${assigner}, sizi "${task.title}" görevine atadı.`
            : `"${task.title}" görevine atandınız.`,
          taskLink(task)
        )
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
        taskLink(task)
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
      .select(
        "*, completed_by_user:users!tasks_completed_by_fkey(full_name), assigned_user:users!tasks_assigned_to_fkey(full_name), projects(title)"
      )
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    const task = mapTask(row);

    if (status === "completed") {
      // Tamamlanan görev tüm ekibe (tamamlayan hariç) bildirilsin;
      // akışta da tamamlama saatiyle görünecek (frontend FeedPanel bunu gösteriyor).
      void this.notifyTeamTaskCompleted(task, requestingUserId);
    } else if (task.assignedTo && task.assignedTo !== requestingUserId) {
      void this.notificationsService.notifyUser(
        task.assignedTo,
        "task_updated",
        "Görev Güncellendi",
        `"${task.title}" görevinin durumu değişti.`,
        taskLink(task)
      );
    }
    return task;
  }

  // Proje/departman sahibi + onaylı üyelerden oluşan ekibe, görevi tamamlayan kişinin
  // adıyla birlikte "görev tamamlandı" bildirimi gönderir.
  private async notifyTeamTaskCompleted(task: Task, completedBy?: string): Promise<void> {
    try {
      const [{ recipients, link }, completerName] = await Promise.all([
        this.getScopeRecipientsAndLink(task),
        this.getUserName(completedBy),
      ]);
      if (completedBy) recipients.delete(completedBy);

      const body = completerName
        ? `${completerName}, "${task.title}" görevini tamamladı.`
        : `"${task.title}" görevi tamamlandı.`;
      await Promise.all(
        [...recipients].map((userId) => this.notificationsService.notifyUser(userId, "task_updated", "Görev Tamamlandı", body, link))
      );
    } catch {
      // bildirim gönderilemese de görev güncellemesi başarılı sayılır
    }
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
        taskLink(task)
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

  // Kullanıcının hedef projede herhangi bir rolü (sahip/üye/taşeron) var mı —
  // görev taşırken hedefe erişimi olmayan bir projeye taşınmasın diye.
  private async assertProjectAccess(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const role = await this.getMembershipRole(projectId, userId);
    if (!role) throw new ForbiddenException("Bu projeye görev taşıma yetkiniz yok");
  }

  // Seçili görev(ler)i (ve üst seviye olanlarınsa tüm alt görevlerini) kopyalar.
  // Aynı seçimde hem bir üst görev hem onun alt görevlerinden biri işaretlenmişse,
  // alt görev ayrıca çoğaltılmaz — üst görevle birlikte zaten kopyalanır.
  async duplicate(ids: string[], requestingUserId?: string): Promise<Task[]> {
    if (!ids?.length) return [];
    const { data: rows, error } = await this.supabase.client
      .from("tasks")
      .select("*")
      .in("id", ids)
      .is("archived_at", null);
    if (error) throw error;
    if (!rows?.length) return [];

    const idSet = new Set(rows.map((r: any) => r.id as string));
    const departmentIds = new Set(rows.filter((r: any) => r.department_id).map((r: any) => r.department_id as string));
    for (const deptId of departmentIds) {
      await this.assertDepartmentAccess(deptId, requestingUserId);
    }

    const nextOrderCache = new Map<string, number>();
    const nextSortOrder = async (projectId: string | null, departmentId: string | null, parentTaskId: string | null) => {
      const cacheKey = `${projectId ?? ""}|${departmentId ?? ""}|${parentTaskId ?? ""}`;
      if (nextOrderCache.has(cacheKey)) {
        const val = nextOrderCache.get(cacheKey)! + 1;
        nextOrderCache.set(cacheKey, val);
        return val;
      }
      let query = this.supabase.client.from("tasks").select("sort_order").order("sort_order", { ascending: false }).limit(1);
      query = projectId ? query.eq("project_id", projectId) : query.eq("department_id", departmentId!);
      query = parentTaskId ? query.eq("parent_task_id", parentTaskId) : query.is("parent_task_id", null);
      const { data: maxRows } = await query;
      const val = ((maxRows?.[0]?.sort_order as number | undefined) ?? -1) + 1;
      nextOrderCache.set(cacheKey, val);
      return val;
    };

    const cloneRow = async (row: any, newParentId: string | null) => {
      const sortOrder = await nextSortOrder(row.project_id, row.department_id, newParentId);
      const { data: inserted, error: insertError } = await this.supabase.client
        .from("tasks")
        .insert({
          project_id: row.project_id,
          department_id: row.department_id,
          output_id: row.output_id,
          assigned_to: row.assigned_to,
          title: `${row.title} (kopya)`,
          description: row.description,
          start_date: row.start_date,
          deadline: row.deadline,
          status: row.status,
          parent_task_id: newParentId,
          budget: row.budget,
          week_number: row.week_number,
          estimated_duration_value: row.estimated_duration_value,
          estimated_duration_unit: row.estimated_duration_unit,
          sort_order: sortOrder,
        })
        .select(
          "*, completed_by_user:users!tasks_completed_by_fkey(full_name), assigned_user:users!tasks_assigned_to_fkey(full_name), projects(title)"
        )
        .single();
      if (insertError) throw insertError;
      return inserted;
    };

    const created: Task[] = [];
    for (const row of rows) {
      // Üst görevi de seçilmiş bir alt görev, üst görevle birlikte zaten kopyalanacak.
      if (row.parent_task_id && idSet.has(row.parent_task_id)) continue;

      const newRow = await cloneRow(row, row.parent_task_id ?? null);
      created.push(mapTask(newRow));

      if (!row.parent_task_id) {
        const { data: children } = await this.supabase.client
          .from("tasks")
          .select("*")
          .eq("parent_task_id", row.id)
          .is("archived_at", null)
          .order("sort_order", { ascending: true });
        for (const child of children ?? []) {
          const newChildRow = await cloneRow(child, newRow.id);
          created.push(mapTask(newChildRow));
        }
      }
    }

    return created;
  }

  // Seçili görev(ler)i başka bir projeye/departmana taşır. Üst seviye bir görev
  // taşınırsa tüm alt görevleri de onunla birlikte taşınır; tek başına seçilen bir
  // alt görev (üst görevi seçili değilse) hedefte üst seviye bir göreve dönüşür.
  async move(
    ids: string[],
    target: { projectId?: string; departmentId?: string },
    requestingUserId?: string
  ): Promise<Task[]> {
    if (!ids?.length) return [];
    if (!target.projectId && !target.departmentId) {
      throw new BadRequestException("Hedef proje ya da departman belirtilmeli");
    }
    if (target.projectId && target.departmentId) {
      throw new BadRequestException("Hedef olarak yalnızca proje ya da departmandan biri seçilebilir");
    }
    if (target.projectId) await this.assertProjectAccess(target.projectId, requestingUserId);
    if (target.departmentId) await this.assertDepartmentAccess(target.departmentId, requestingUserId);

    const { data: rows, error } = await this.supabase.client
      .from("tasks")
      .select("*")
      .in("id", ids)
      .is("archived_at", null);
    if (error) throw error;
    if (!rows?.length) return [];

    const idSet = new Set(rows.map((r: any) => r.id as string));
    const topLevelRows = rows.filter((r: any) => !(r.parent_task_id && idSet.has(r.parent_task_id)));

    const nextOrderCache = new Map<string, number>();
    const nextSortOrder = async (parentTaskId: string | null) => {
      const cacheKey = parentTaskId ?? "__root__";
      if (nextOrderCache.has(cacheKey)) {
        const val = nextOrderCache.get(cacheKey)! + 1;
        nextOrderCache.set(cacheKey, val);
        return val;
      }
      let query = this.supabase.client.from("tasks").select("sort_order").order("sort_order", { ascending: false }).limit(1);
      query = target.projectId ? query.eq("project_id", target.projectId) : query.eq("department_id", target.departmentId!);
      query = parentTaskId ? query.eq("parent_task_id", parentTaskId) : query.is("parent_task_id", null);
      const { data: maxRows } = await query;
      const val = ((maxRows?.[0]?.sort_order as number | undefined) ?? -1) + 1;
      nextOrderCache.set(cacheKey, val);
      return val;
    };

    const moved: Task[] = [];
    const applyMove = async (id: string, parentTaskId: string | null) => {
      const sortOrder = await nextSortOrder(parentTaskId);
      const patch: Record<string, unknown> = {
        project_id: target.projectId ?? null,
        department_id: target.departmentId ?? null,
        parent_task_id: parentTaskId,
        sort_order: sortOrder,
      };
      // Çıktı (output) eski projeye özgüdür; farklı bir projeye taşınırken geçersiz kalır.
      if (target.projectId) patch.output_id = null;
      const { data: row, error: updateError } = await this.supabase.client
        .from("tasks")
        .update(patch)
        .eq("id", id)
        .select(
          "*, completed_by_user:users!tasks_completed_by_fkey(full_name), assigned_user:users!tasks_assigned_to_fkey(full_name), projects(title)"
        )
        .maybeSingle();
      if (updateError) throw updateError;
      if (row) moved.push(mapTask(row));
    };

    for (const row of topLevelRows) {
      await applyMove(row.id, null);
      const { data: children } = await this.supabase.client
        .from("tasks")
        .select("id")
        .eq("parent_task_id", row.id)
        .is("archived_at", null);
      for (const child of children ?? []) {
        await applyMove(child.id, row.id);
      }
    }

    return moved;
  }

  async reorder(ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client
      .from("tasks")
      .select("id, project_id, department_id, parent_task_id")
      .in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) {
      throw new BadRequestException("Geçersiz sıralama isteği");
    }

    const projectIds = new Set(rows.map((r: any) => r.project_id));
    const departmentIds = new Set(rows.map((r: any) => r.department_id));
    if (projectIds.size > 1 || departmentIds.size > 1) {
      throw new BadRequestException("Sıralanan görevler aynı projeye/departmana ait olmalı");
    }
    // Ya hepsi aynı üst görevin altındaki alt görevler, ya da hepsi üst seviye görevler olmalı.
    const parentIds = new Set(rows.map((r: any) => r.parent_task_id ?? null));
    if (parentIds.size > 1) {
      throw new BadRequestException("Sıralanan görevler aynı üst göreve/sütuna ait olmalı");
    }

    await applyOrder(this.supabase.client, "tasks", ids);
  }
}
