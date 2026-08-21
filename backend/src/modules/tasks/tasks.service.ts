import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Task, TaskAssignee, TaskAttachment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { applyOrder } from "../../common/reorder.util";
import { assertSubtaskMoveAllowed, assertSubtaskMoveRequest, subtaskScopePatch } from "./subtask-move";

/**
 * Görev satırının standart sütun listesi — görevi döndüren HER uç bunu kullanır.
 *
 * NEDEN TEK SABİT: istemci, güncellenen görevi listedeki eskisinin YERİNE
 * yazıyor (`prev.map(t => t.id === updated.id ? updated : t)`, bkz. web'de
 * ProjectDetail / JobDetail / DepartmentTasksPanel). Uçlardan biri dar bir
 * select kullanırsa o alan yanıtta gelmez ve ekranda kaybolur: durum
 * değiştirdiğinde ek rozeti sönen kart bunun tipik belirtisiydi. Sütunları
 * çoğaltmak yerine tek yerde tutmak bu sınıf hatayı baştan siliyor.
 *
 * Ekler iki tabloda yaşıyor: link `task_attachments`, dosya `files`
 * (`files.task_id`). İkisi de görevle BİRLİKTE geliyor — ayrı uçtan çekmek
 * pano başına görev sayısı kadar istek demekti (bkz. operations.service.ts).
 */
const TASK_SELECT =
  "*, completed_by_user:users!tasks_completed_by_fkey(full_name), assigned_user:users!tasks_assigned_to_fkey(full_name), task_assignees(user_id, assigned_at, users!task_assignees_user_id_fkey(full_name, avatar_url)), projects(title), task_attachments(id, kind, url, label, created_at), files(id, name, web_view_link)";

function mapAttachment(row: any): TaskAttachment {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    url: row.url,
    label: row.label ?? undefined,
    fileName: row.file_name ?? undefined,
    fileSize: row.file_size != null ? Number(row.file_size) : undefined,
    createdBy: row.created_by ?? undefined,
    createdByName: row.creator?.full_name ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Görevin atananları. Sorguya task_assignees dahil edilmediyse (eski/dar
 * select'ler) undefined döner — "atanan yok" ile "bilgi çekilmedi" karışmasın.
 * Birincil atanan her zaman başa alınır; gerisi atanma sırasına göre.
 */
function mapAssignees(row: any): TaskAssignee[] | undefined {
  const rows = row.task_assignees;
  if (!Array.isArray(rows)) return undefined;
  const list: TaskAssignee[] = rows.map((a: any) => ({
    userId: a.user_id,
    fullName: a.users?.full_name ?? undefined,
    avatarUrl: a.users?.avatar_url ?? undefined,
    assignedAt: a.assigned_at ?? undefined,
  }));
  const primary = row.assigned_to;
  return list.sort((x, y) => {
    if (x.userId === primary) return -1;
    if (y.userId === primary) return 1;
    return (x.assignedAt ?? "").localeCompare(y.assignedAt ?? "");
  });
}

function mapTask(row: any): Task {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    outputId: row.output_id ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    assignedToName: row.assigned_user?.full_name ?? undefined,
    assignees: mapAssignees(row),
    title: row.title,
    description: row.description ?? undefined,
    startDate: row.start_date ?? undefined,
    deadline: row.deadline,
    // "17:30:00" -> "17:30": arayüzdeki <input type="time"> saniye beklemiyor.
    deadlineTime: row.deadline_time ? String(row.deadline_time).slice(0, 5) : undefined,
    reminderLeadMinutes: row.reminder_lead_minutes ?? undefined,
    reminderSentAt: row.reminder_sent_at ?? undefined,
    status: row.status,
    priority: row.priority ?? 0,
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
    sourceModuleKey: row.source_module_key ?? undefined,
    sourceRecordId: row.source_record_id ?? undefined,
    // Ekler TASK_SELECT ile her görev yanıtında gelir. Dizi değilse alan
    // undefined kalır ("bilgi çekilmedi"), boş dizi ise "ek yok" — ikisi
    // arayüzde aynı görünse de karıştırılmasın.
    attachments: Array.isArray(row.task_attachments)
      ? row.task_attachments.map((a: any) => ({
          id: a.id,
          taskId: row.id,
          kind: a.kind,
          url: a.url,
          label: a.label ?? undefined,
          createdAt: a.created_at ?? row.created_at,
        }))
      : undefined,
    files: Array.isArray(row.files)
      ? row.files.map((f: any) => ({ id: f.id, name: f.name, webViewLink: f.web_view_link ?? undefined }))
      : undefined,
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

  // requestingUserId verilirse önce projeye erişimi olduğu doğrulanır; ayrıca bu
  // kullanıcı projede taşeron (subcontractor) ise, sonuç sadece kendisine atanmış
  // görev/alt görevlerle sınırlandırılır.
  async findByProject(projectId: string, requestingUserId?: string): Promise<Task[]> {
    await this.assertProjectAccess(projectId, requestingUserId);

    const { data, error } = await this.supabase.client
      .from("tasks")
      .select(TASK_SELECT)
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

  async findByDepartment(departmentId: string, requestingUserId?: string): Promise<Task[]> {
    await this.assertDepartmentAccess(departmentId, requestingUserId);

    const { data, error } = await this.supabase.client
      .from("tasks")
      .select(TASK_SELECT)
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

  /**
   * Görevin atanan listesini verilen kümeye eşitler ve `tasks.assigned_to`yu
   * listenin ilk üyesiyle senkron tutar.
   *
   * İki kaynağı tek yerde birleştirmenin sebebi: `assigned_to` hâlâ birçok
   * sorgunun (Yapılacaklar panosu dışında liste/filtre/bildirim) dayandığı alan.
   * İkisi ayrı yollardan güncellenirse er ya da geç ayrışırlar; "görevde üç kişi
   * yazıyor ama kart boş" gibi hatalar buradan çıkar.
   *
   * Yeni eklenenlere bildirim gider, çıkarılanlara gitmez — birinin listeden
   * düşürülmesi ona bildirilecek bir "atama" değil.
   */
  private async syncAssignees(
    taskId: string,
    userIds: string[],
    requestingUserId?: string,
    notifyContext?: { title: string; link?: string }
  ): Promise<void> {
    // Sıra korunarak tekilleştirilir: ilk eleman birincil atanan olacak.
    const next = Array.from(new Set(userIds.filter(Boolean)));

    const { data: existingRows } = await this.supabase.client
      .from("task_assignees")
      .select("user_id")
      .eq("task_id", taskId);
    const existing = new Set((existingRows ?? []).map((r: any) => r.user_id as string));

    const toAdd = next.filter((id) => !existing.has(id));
    const toRemove = [...existing].filter((id) => !next.includes(id));

    if (toRemove.length) {
      await this.supabase.client.from("task_assignees").delete().eq("task_id", taskId).in("user_id", toRemove);
    }
    if (toAdd.length) {
      await this.supabase.client
        .from("task_assignees")
        .insert(toAdd.map((userId) => ({ task_id: taskId, user_id: userId, assigned_by: requestingUserId ?? null })));
    }

    await this.supabase.client
      .from("tasks")
      .update({ assigned_to: next[0] ?? null })
      .eq("id", taskId);

    if (notifyContext) {
      const assigner = await this.getUserName(requestingUserId);
      for (const userId of toAdd) {
        if (userId === requestingUserId) continue;
        this.notificationsService.notifyUser(
          userId,
          "task_assigned",
          "Yeni Görev Atandı",
          assigner
            ? `${assigner}, sizi "${notifyContext.title}" görevine atadı.`
            : `"${notifyContext.title}" görevine atandınız.`,
          notifyContext.link
        );
      }
    }
  }

  // ------------------------------------------------------------------ ekler
  //
  // Ek, görevin bir parçası: yetki kontrolü de görevin kendi erişim kuralını
  // kullanır (proje üyeliği ya da departman kadrosu). Ayrı bir izin katmanı
  // açmıyoruz — "görevi görebilen ekini de görür" tek ve anlaşılır kural.
  //
  // BURAYA DOSYA YÜKLENMEZ. Dosyalar Google Drive / OneDrive'da yaşar ve files
  // modülü üzerinden bağlanır (bkz. FilesPanel); bu tablo yalnızca BAĞLANTI
  // tutar. Dosyanın kendisini kendi depomuza kopyalamak, aynı belgenin iki yerde
  // ayrı ayrı yaşamasına ve hangisinin güncel olduğunun belirsizleşmesine yol
  // açıyordu — kullanıcının dosyası kendi bulutunda kalmalı.

  async findAttachments(taskId: string, requestingUserId?: string): Promise<TaskAttachment[]> {
    await this.assertTaskAccess(await this.getTaskScope(taskId), requestingUserId);
    const { data, error } = await this.supabase.client
      .from("task_attachments")
      .select("*, creator:users!task_attachments_created_by_fkey(full_name)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapAttachment);
  }

  async addLinkAttachment(
    taskId: string,
    body: { url?: string; label?: string },
    requestingUserId?: string
  ): Promise<TaskAttachment> {
    await this.assertTaskAccess(await this.getTaskScope(taskId), requestingUserId);
    const url = (body.url ?? "").trim();
    if (!url) throw new BadRequestException("Bağlantı adresi boş olamaz");

    const { data, error } = await this.supabase.client
      .from("task_attachments")
      .insert({
        task_id: taskId,
        kind: "link",
        url,
        label: body.label?.trim() || null,
        created_by: requestingUserId ?? null,
      })
      .select("*, creator:users!task_attachments_created_by_fkey(full_name)")
      .single();
    if (error) throw error;
    return mapAttachment(data);
  }

  async removeAttachment(attachmentId: string, requestingUserId?: string): Promise<{ success: true }> {
    const { data: row } = await this.supabase.client
      .from("task_attachments")
      .select("task_id")
      .eq("id", attachmentId)
      .maybeSingle();
    if (!row) throw new NotFoundException("Ek bulunamadı");
    await this.assertTaskAccess(await this.getTaskScope(row.task_id), requestingUserId);

    // Depodaki dosya bilerek silinmiyor: aynı url'i başka bir yere kopyalamış
    // olabilir ve kova temizliği ayrı bir bakım işi. Kayıt kalkınca ek listede
    // görünmez, kullanıcı için işlem tamamlanmış olur.
    const { error } = await this.supabase.client.from("task_attachments").delete().eq("id", attachmentId);
    if (error) throw error;
    return { success: true };
  }

  /**
   * Tek bir görevi tam kaydıyla döndürür. Kısmi görünümlerden (pano kartı, rutin
   * tekrar satırı) düzenleme modalı açılırken kullanılır: eksik alanlarla açılan
   * bir form kaydederken o alanları siler.
   */
  async findById(id: string, requestingUserId?: string): Promise<Task> {
    await this.assertTaskAccess(await this.getTaskScope(id), requestingUserId);
    return this.reloadTask(id);
  }

  /**
   * Kullanıcının kendi isteğiyle görevden ayrılması (atamadan çıkması).
   *
   * Görevi silmez, başkalarının atamasına dokunmaz; yalnızca kendi satırını
   * kaldırır. Son atanan da ayrılırsa görev "atanmamış" hale gelir — kimseye
   * zorla bırakılmaktansa sahipsiz kalması daha dürüst, ekip bunu görüp
   * yeniden atayabilir.
   *
   * `syncAssignees` üzerinden gidiyor ki `tasks.assigned_to` (birincil atanan)
   * da güncellensin: iki kaynağı ayrı ayrı yazmak onları er ya da geç ayırır.
   */
  async leaveTask(taskId: string, userId: string): Promise<Task> {
    await this.assertTaskAccess(await this.getTaskScope(taskId), userId);

    const { data: rows } = await this.supabase.client
      .from("task_assignees")
      .select("user_id")
      .eq("task_id", taskId);
    const current = (rows ?? []).map((r: any) => r.user_id as string);
    if (!current.includes(userId)) throw new NotFoundException("Bu göreve atanmış değilsin");

    await this.syncAssignees(
      taskId,
      current.filter((id) => id !== userId),
      userId
    );
    return this.reloadTask(taskId);
  }

  /** Atamalar yazıldıktan sonra görevi güncel hâliyle (atananlar dahil) okur. */
  private async reloadTask(id: string): Promise<Task> {
    const { data: row } = await this.supabase.client
      .from("tasks")
      .select(TASK_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Görev bulunamadı");
    return mapTask(row);
  }

  /** İstekteki atama alanlarını tek bir listeye indirger. */
  private resolveAssigneeIds(data: Partial<Task>): string[] | undefined {
    if (Array.isArray(data.assignedToIds)) return data.assignedToIds.filter(Boolean);
    // Eski istemciler yalnızca assignedTo gönderiyor; tek kişilik liste sayılır.
    if (data.assignedTo !== undefined) return data.assignedTo ? [data.assignedTo] : [];
    return undefined;
  }

  // Kullanıcının bu projedeki rolünü döner: proje sahibiyse "owner", onaylı bir
  // project_members kaydı varsa oradaki rol ("member" / "subcontractor" / "owner"),
  // yoksa null. Yalnızca "approved" durumundaki üyelikler sayılır — reddedilmiş ya
  // da hâlâ onay bekleyen bir katılım isteği erişim vermemeli.
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
      .eq("status", "approved")
      .maybeSingle();
    return membership?.role ?? null;
  }

  // Kullanıcının bu projeye herhangi bir erişimi (sahip/üye/taşeron) var mı.
  // requestingUserId verilmezse (dahili çağrılar) kontrol atlanır — projeler
  // modülündeki assertCanManage ile aynı desen.
  async assertProjectAccess(projectId: string, userId?: string, message?: string): Promise<void> {
    if (!userId) return;
    const role = await this.getMembershipRole(projectId, userId);
    if (!role) throw new ForbiddenException(message ?? "Bu projeye erişim yetkiniz yok");
  }

  // Bir görevin ait olduğu proje ya da departmana göre doğru erişim kontrolünü uygular.
  private async assertTaskAccess(
    task: { projectId?: string | null; departmentId?: string | null } | null | undefined,
    userId?: string
  ): Promise<void> {
    if (!task || !userId) return;
    if (task.projectId) {
      await this.assertProjectAccess(task.projectId, userId, "Bu görevi yalnızca proje sahibi veya ekibi yönetebilir");
    } else if (task.departmentId) {
      await this.assertDepartmentAccess(task.departmentId, userId);
    }
  }

  // Var olan bir görevin proje/departman kapsamını çeker; sonra assertTaskAccess'e verilir.
  // Görev bulunamazsa null döner — çağıran taraf zaten kendi NotFoundException'ını fırlatır.
  private async getTaskScope(id: string): Promise<{ projectId?: string | null; departmentId?: string | null } | null> {
    const { data } = await this.supabase.client.from("tasks").select("project_id, department_id").eq("id", id).maybeSingle();
    if (!data) return null;
    return { projectId: data.project_id, departmentId: data.department_id };
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
    await this.assertProjectAccess(projectId, requestingUserId, "Bu projeye görev ekleme yetkiniz yok");

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
        // Atama yapılmadıysa görev oluşturana atanır. Yapılacaklar panosunun
        // kaynağı (v_personal_board) yalnızca assigned_to üzerinden çalıştığı
        // için, atanmamış görevler hiç kimsenin panosuna düşmüyordu: kendi
        // işindeki projeye görev ekleyen kullanıcı onu Yapılacaklar'da hiç
        // göremiyordu. Başkasına atamak isteyen zaten assignedTo gönderiyor.
        assigned_to: data.assignedTo ?? requestingUserId ?? null,
        title: data.title ?? "",
        description: data.description ?? null,
        start_date: data.startDate ?? null,
        deadline: data.deadline ?? new Date().toISOString(),
        deadline_time: data.deadlineTime || null,
        // Hatırlatma yalnızca saat varsa kurulabilir (DB'de de CHECK var).
        reminder_lead_minutes: data.deadlineTime ? (data.reminderLeadMinutes ?? null) : null,
        status: data.status ?? "todo",
        parent_task_id: data.parentTaskId ?? null,
        budget: data.budget ?? 0,
        week_number: data.weekNumber ?? null,
        estimated_duration_value: data.estimatedDurationValue ?? null,
        estimated_duration_unit: data.estimatedDurationUnit ?? null,
        // Modül kaydından doğan görevlerde kaynak taşınır (bkz. 051).
        source_module_key: data.sourceModuleKey ?? null,
        source_record_id: data.sourceRecordId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    const task = mapTask(row);

    // Atama ilişkisi ayrı tabloda tutulur (bkz. 053); insert'teki assigned_to
    // yalnızca birincil atanandır, listenin tamamı burada kurulur.
    const requested = this.resolveAssigneeIds(data) ?? [];
    const assignees = requested.length ? requested : task.assignedTo ? [task.assignedTo] : [];
    if (assignees.length) {
      await this.syncAssignees(task.id, assignees, requestingUserId, {
        title: task.title,
        link: taskLink(task),
      });
    }

    // Yeni görev eklendiğinde (alt görevler hariç) proje ekibine push/bildirim gitsin.
    if (!task.parentTaskId) {
      void this.notifyTeamNewTask(task, requestingUserId);
    }
    return this.reloadTask(task.id);
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
        // Proje görevlerindeki kuralın aynısı: atama yapılmadıysa görev
        // oluşturana atanır. Aksi halde görev hiç kimsenin Yapılacaklar
        // panosuna düşmüyor (bkz. v_personal_board yalnızca assigned_to'ya bakar).
        assigned_to: data.assignedTo ?? requestingUserId ?? null,
        title: data.title ?? "",
        description: data.description ?? null,
        start_date: data.startDate ?? null,
        deadline: data.deadline ?? new Date().toISOString(),
        deadline_time: data.deadlineTime || null,
        reminder_lead_minutes: data.deadlineTime ? (data.reminderLeadMinutes ?? null) : null,
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

    // Proje görevlerindeki desenin aynısı: atama ilişkisi ayrı tabloda tutulur
    // (bkz. 055). Bu satır olmadan görev hiç kimsenin Yapılacaklar panosuna
    // düşmüyordu — pano artık task_assignees'ten besleniyor, assigned_to'dan değil.
    const requested = this.resolveAssigneeIds(data) ?? [];
    const assignees = requested.length ? requested : task.assignedTo ? [task.assignedTo] : [];
    if (assignees.length) {
      await this.syncAssignees(task.id, assignees, requestingUserId, {
        title: task.title,
        link: taskLink(task),
      });
    }

    if (!task.parentTaskId) {
      void this.notifyTeamNewTask(task, requestingUserId);
    }
    return assignees.length ? this.reloadTask(task.id) : task;
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
    await this.assertTaskAccess(previous, requestingUserId);

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.startDate !== undefined) patch.start_date = data.startDate || null;
    if (data.deadline !== undefined) patch.deadline = data.deadline;
    // Saat ya da ön süre değiştiyse hatırlatma yeniden kurulmalı: gönderildi
    // damgası temizlenmezse zamanlanmış iş bu görevi bir daha hiç ele almaz.
    if (data.deadlineTime !== undefined) {
      patch.deadline_time = data.deadlineTime || null;
      patch.reminder_sent_at = null;
      // Saat kaldırıldıysa hatırlatma da düşer (DB'deki CHECK ile aynı kural).
      if (!data.deadlineTime) patch.reminder_lead_minutes = null;
    }
    if (data.reminderLeadMinutes !== undefined) {
      patch.reminder_lead_minutes = data.reminderLeadMinutes ?? null;
      patch.reminder_sent_at = null;
    }
    // Atama artık ayrı tabloda (bkz. 053): assigned_to'yu burada elle set etmiyoruz,
    // aşağıda syncAssignees hem listeyi hem birincil atananı birlikte yazıyor.
    const requestedAssignees = this.resolveAssigneeIds(data);
    if (data.budget !== undefined) {
      patch.budget = data.budget;
      patch.budget_status = "pending";
    }
    if (data.weekNumber !== undefined) patch.week_number = data.weekNumber;
    if (data.outputId !== undefined) patch.output_id = data.outputId;
    // Öncelik yıldızı 0-5. Aralık dışı bir değer DB'deki CHECK'e takılıp 500
    // dönerdi; burada sınırlayıp anlamlı bir kayda çeviriyoruz.
    if (data.priority !== undefined) {
      patch.priority = Math.min(5, Math.max(0, Math.trunc(Number(data.priority) || 0)));
    }
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
      .select(TASK_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Görev bulunamadı");
    const task = mapTask(row);

    // Atama listesi istekte varsa eşitlenir; bildirim yalnızca YENİ eklenenlere
    // gider (syncAssignees içinde), listeden çıkarılanlara değil.
    if (requestedAssignees) {
      await this.syncAssignees(id, requestedAssignees, requestingUserId, {
        title: task.title,
        link: taskLink(task),
      });
    }

    const contentChanged =
      previous &&
      (previous.title !== task.title || previous.deadline !== task.deadline || previous.startDate !== task.startDate);
    if (contentChanged) {
      // İçerik değiştiyse görevde yer alan HERKES haberdar olmalı, yalnızca
      // birincil atanan değil.
      const { data: rows } = await this.supabase.client
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", id);
      for (const r of rows ?? []) {
        if ((r as any).user_id === requestingUserId) continue;
        void this.notificationsService.notifyUser(
          (r as any).user_id,
          "task_updated",
          "Görev Güncellendi",
          `"${task.title}" görevinde güncelleme var.`,
          taskLink(task)
        );
      }
    }

    return requestedAssignees ? this.reloadTask(id) : task;
  }

  /**
   * Bir ALT GÖREVİ başka bir üst görevin altına taşır.
   *
   * Neden `update()` içinde değil: oradan `parent_task_id` yazılabilseydi
   * herhangi bir görev herhangi birinin altına düşer, uygulamanın her yerinde
   * varsayılan iki seviyelik yapı (görev → alt görev) bozulurdu. Burada taşıma
   * kendi kurallarıyla çalışıyor:
   * - yalnızca hâlihazırda alt görev olan bir kayıt taşınabilir,
   * - hedef bir ÜST görev olmalı (alt görevin altına alt görev asılmaz),
   * - hedef başka bir projede/departmandaysa alt görev onun kapsamını devralır,
   *   yoksa üst göreviyle farklı yerlerde yaşayan bir kayıt ortaya çıkardı.
   */
  async updateParent(id: string, parentTaskId: string, requestingUserId?: string): Promise<Task> {
    assertSubtaskMoveRequest(id, parentTaskId);

    const { data: row } = await this.supabase.client.from("tasks").select().eq("id", id).maybeSingle();
    if (!row) throw new NotFoundException("Görev bulunamadı");
    const task = mapTask(row);
    await this.assertTaskAccess(task, requestingUserId);
    if (task.parentTaskId === parentTaskId) return task;

    const { data: parentRow } = await this.supabase.client
      .from("tasks")
      .select()
      .eq("id", parentTaskId)
      .maybeSingle();
    if (!parentRow) throw new NotFoundException("Hedef üst görev bulunamadı");
    const parent = mapTask(parentRow);
    await this.assertTaskAccess(parent, requestingUserId);
    assertSubtaskMoveAllowed(task, parent);

    // Hedefin sonuna eklenir; kullanıcı bırakır bırakmaz gelen reorder isteği
    // (bkz. TaskColumn) kesin sırayı yazar.
    const { data: maxRows } = await this.supabase.client
      .from("tasks")
      .select("sort_order")
      .eq("parent_task_id", parentTaskId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const patch: Record<string, unknown> = {
      parent_task_id: parentTaskId,
      sort_order: ((maxRows?.[0]?.sort_order as number | undefined) ?? -1) + 1,
      ...subtaskScopePatch(row, parentRow),
    };

    const { data: updatedRow, error } = await this.supabase.client
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select(TASK_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!updatedRow) throw new NotFoundException("Görev bulunamadı");
    return mapTask(updatedRow);
  }

  async updateBudgetStatus(id: string, budgetStatus: Task["budgetStatus"], requestingUserId?: string): Promise<Task> {
    await this.assertTaskAccess(await this.getTaskScope(id), requestingUserId);

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
    await this.assertTaskAccess(await this.getTaskScope(id), requestingUserId);

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
      .select(TASK_SELECT)
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

      // GÖREV ORTAKLARI AYRICA EKLENİR. Yukarıdaki kapsam listesi yalnızca
      // proje/departman ÜYELİĞİNDEN geliyor; göreve atanmış biri o listede
      // olmayabiliyor (ör. iş ekibinden ya da taşeron olarak atanmış kişi).
      // Atama anında bildirim alıp (bkz. task_assigned) görev bitince haber
      // alamamak en çok o kişiyi ilgilendiren olayı kaçırmak demekti.
      for (const assignee of task.assignees ?? []) recipients.add(assignee.userId);
      if (task.assignedTo) recipients.add(task.assignedTo);

      // Tamamlayan en sona: yukarıdaki eklemeler onu geri getirmiş olabilir
      // (kişi hem atanan hem tamamlayan olabiliyor) ve kimse kendi yaptığı iş
      // için kendine bildirim almamalı.
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

  async updateSchedule(id: string, startDate?: string, deadline?: string, requestingUserId?: string): Promise<Task> {
    await this.assertTaskAccess(await this.getTaskScope(id), requestingUserId);

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

  async remove(id: string, requestingUserId?: string): Promise<void> {
    await this.assertTaskAccess(await this.getTaskScope(id), requestingUserId);

    const { error } = await this.supabase.client.from("tasks").delete().eq("id", id);
    if (error) throw error;
  }

  async archive(id: string, requestingUserId?: string): Promise<Task> {
    await this.assertTaskAccess(await this.getTaskScope(id), requestingUserId);

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

  // Seçili görev(ler)i (ve üst seviye olanlarınsa tüm alt görevlerini) toplu
  // arşivler. `duplicate`/`move` ile aynı desen: üst görevi de seçilmiş bir alt
  // görev ayrıca işlenmez, üst görevin çocuk-arşivleme adımıyla zaten kapsanır.
  async bulkArchive(ids: string[], requestingUserId?: string): Promise<Task[]> {
    if (!ids?.length) return [];
    const { data: rows, error } = await this.supabase.client
      .from("tasks")
      .select("*")
      .in("id", ids)
      .is("archived_at", null);
    if (error) throw error;
    if (!rows?.length) return [];

    const departmentIds = new Set(rows.filter((r: any) => r.department_id).map((r: any) => r.department_id as string));
    for (const deptId of departmentIds) {
      await this.assertDepartmentAccess(deptId, requestingUserId);
    }
    const projectIds = new Set(rows.filter((r: any) => r.project_id).map((r: any) => r.project_id as string));
    for (const projectId of projectIds) {
      await this.assertProjectAccess(projectId, requestingUserId, "Bu görevleri arşivleme yetkiniz yok");
    }

    const idSet = new Set(rows.map((r: any) => r.id as string));
    const archivedAt = new Date().toISOString();
    const archived: Task[] = [];

    for (const row of rows) {
      // Üst görevi de seçilmiş bir alt görev, üst görevle birlikte zaten arşivlenecek.
      if (row.parent_task_id && idSet.has(row.parent_task_id)) continue;

      const { data: updatedRow, error: updateError } = await this.supabase.client
        .from("tasks")
        .update({ archived_at: archivedAt })
        .eq("id", row.id)
        .select(TASK_SELECT)
        .maybeSingle();
      if (updateError) throw updateError;
      if (updatedRow) archived.push(mapTask(updatedRow));

      // Bu görevin varsa tüm alt görevlerini de arşivle.
      const { data: childRows, error: childError } = await this.supabase.client
        .from("tasks")
        .update({ archived_at: archivedAt })
        .eq("parent_task_id", row.id)
        .is("archived_at", null)
        .select(TASK_SELECT);
      if (childError) throw childError;
      for (const child of childRows ?? []) archived.push(mapTask(child));
    }

    return archived;
  }

  // Seçili görev(ler)i toplu siler. `parent_task_id` FK'si ON DELETE CASCADE
  // olduğu için (bkz. migration 002_add_task_parent_id) üst görev silinince alt
  // görevleri veritabanı tarafından otomatik silinir; tek satırlık toplu DELETE
  // bu yüzden hem üst hem alt görev id'leri için güvenle kullanılabilir.
  async bulkRemove(ids: string[], requestingUserId?: string): Promise<string[]> {
    if (!ids?.length) return [];
    const { data: rows, error } = await this.supabase.client
      .from("tasks")
      .select("id, project_id, department_id")
      .in("id", ids);
    if (error) throw error;
    if (!rows?.length) return [];

    const departmentIds = new Set(rows.filter((r: any) => r.department_id).map((r: any) => r.department_id as string));
    for (const deptId of departmentIds) {
      await this.assertDepartmentAccess(deptId, requestingUserId);
    }
    const projectIds = new Set(rows.filter((r: any) => r.project_id).map((r: any) => r.project_id as string));
    for (const projectId of projectIds) {
      await this.assertProjectAccess(projectId, requestingUserId, "Bu görevleri silme yetkiniz yok");
    }

    const idsToDelete = rows.map((r: any) => r.id as string);
    const { error: deleteError } = await this.supabase.client.from("tasks").delete().in("id", idsToDelete);
    if (deleteError) throw deleteError;

    return idsToDelete;
  }

  async restore(id: string, requestingUserId?: string): Promise<Task> {
    await this.assertTaskAccess(await this.getTaskScope(id), requestingUserId);

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
    // Proje bağlamındaki kaynak görevler için de erişim kontrolü — aksi halde
    // erişimi olmayan bir projenin görevleri, erişimi olduğu bir yere kopyalanabilirdi.
    const sourceProjectIds = new Set(rows.filter((r: any) => r.project_id).map((r: any) => r.project_id as string));
    for (const projectId of sourceProjectIds) {
      await this.assertProjectAccess(projectId, requestingUserId, "Bu görevleri çoğaltma yetkiniz yok");
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
        .select(TASK_SELECT)
        .single();
      if (insertError) throw insertError;
      // Kopyaya atamalar da taşınır; yoksa kopya hiçbir panoda görünmez
      // (bkz. 055 — pano task_assignees'ten besleniyor).
      const { data: sourceAssignees } = await this.supabase.client
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", row.id);
      const userIds = (sourceAssignees ?? []).map((a: any) => a.user_id as string);
      if (userIds.length) {
        await this.supabase.client
          .from("task_assignees")
          .insert(userIds.map((userId) => ({ task_id: inserted.id, user_id: userId, assigned_by: requestingUserId ?? null })));
      }
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
    if (target.projectId) await this.assertProjectAccess(target.projectId, requestingUserId, "Bu projeye görev taşıma yetkiniz yok");
    if (target.departmentId) await this.assertDepartmentAccess(target.departmentId, requestingUserId);

    const { data: rows, error } = await this.supabase.client
      .from("tasks")
      .select("*")
      .in("id", ids)
      .is("archived_at", null);
    if (error) throw error;
    if (!rows?.length) return [];

    // Kaynak görevlerin ait olduğu proje(ler)/departman(lar) için de erişim kontrolü —
    // yalnızca hedefe erişimi olması, başkasının görevini taşımaya yetmemeli.
    const sourceProjectIds = new Set(rows.filter((r: any) => r.project_id).map((r: any) => r.project_id as string));
    for (const projectId of sourceProjectIds) {
      await this.assertProjectAccess(projectId, requestingUserId, "Bu görevleri taşıma yetkiniz yok");
    }
    const sourceDepartmentIds = new Set(rows.filter((r: any) => r.department_id).map((r: any) => r.department_id as string));
    for (const departmentId of sourceDepartmentIds) {
      await this.assertDepartmentAccess(departmentId, requestingUserId);
    }

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
        .select(TASK_SELECT)
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

  async reorder(ids: string[], requestingUserId?: string): Promise<void> {
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

    await this.assertTaskAccess({ projectId: rows[0].project_id, departmentId: rows[0].department_id }, requestingUserId);

    await applyOrder(this.supabase.client, "tasks", ids);
  }
}
