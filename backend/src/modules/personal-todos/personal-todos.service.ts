import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  PersonalBoardItem,
  PersonalBoardSource,
  PersonalTodo,
  Task,
  TaskPriority,
  TaskStatus,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "completed"];

/**
 * GÜVENLİK NOTU
 * -------------
 * Projelio Supabase Auth kullanmıyor; kimlik `public.users` + JWT üzerinde.
 * Bu yüzden personal_todos / personal_task_prefs tablolarında RLS açık ama
 * politika yok: erişim yalnızca service_role ile, yani tam olarak bu servisten.
 *
 * Sonuç: kullanıcı izolasyonu TAMAMEN bu dosyanın sorumluluğu. Buradaki her
 * sorgu, istisnasız, oturumdaki kullanıcının id'siyle filtrelenmek zorunda.
 * `userId` asla request gövdesinden/parametresinden alınmaz — daima
 * `req.user.userId`'den gelir.
 *
 * Kişisel görevler kullanıcının kimseye göstermediği kayıtlardır; bu tabloları
 * okuyan her yeni kod yolu (rapor, bildirim, dışa aktarma, AI bağlamı) bu
 * gözle ayrıca gözden geçirilmelidir.
 */
@Injectable()
export class PersonalTodosService {
  constructor(private supabase: SupabaseService) {}

  // ------------------------------------------------------------------ Pano

  /**
   * Kullanıcının panosu. Kişisel görevler ve kendisine atanmış görevler tek
   * akışta gelir; ayrım `source` alanındadır.
   */
  async getBoard(
    userId: string,
    opts: { source?: PersonalBoardSource | "all"; includeHidden?: boolean; completedWithinDays?: number } = {}
  ): Promise<PersonalBoardItem[]> {
    const source = opts.source ?? "all";
    const completedWithinDays = opts.completedWithinDays ?? 14;

    let query = this.supabase.client
      .from("v_personal_board")
      .select("*")
      // Tek ve vazgeçilmez izolasyon filtresi.
      .eq("board_user_id", userId);

    if (source !== "all") query = query.eq("source", source);
    if (!opts.includeHidden) query = query.eq("is_hidden", false);

    // Sıralama kuralı: kullanıcının elle yerleştirdiği kartlar kendi sırasında
    // en üstte; henüz hiç dokunulmamış atanan görevler (view'da sentinel
    // sort_order alırlar) altta, aciliyete göre. Kolonda ilk sürükleme
    // yapıldığı anda tüm kolon yeniden numaralandığı için sentinel devreden çıkar.
    const { data, error } = await query
      .order("sort_order", { ascending: true })
      .order("effective_due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw error;

    // "Tamamlandı" kolonu sınırsız büyümesin: varsayılan olarak son N gün.
    // Filtreyi burada yapıyoruz çünkü henüz tamamlanmamış kartlarda
    // completed_at null ve PostgREST'te "null VEYA tarihten yeni" ifadesi
    // okunaksız kalıyor.
    const cutoff = Date.now() - completedWithinDays * 24 * 60 * 60 * 1000;
    return (data ?? [])
      .filter((row: any) => {
        if (row.status !== "completed") return true;
        if (!row.completed_at) return true;
        return new Date(row.completed_at).getTime() >= cutoff;
      })
      .map(mapBoardItem);
  }

  // --------------------------------------------------- Kişisel görev CRUD

  async create(
    userId: string,
    body: { title?: string; description?: string; status?: TaskStatus; priority?: number; color?: string; dueDate?: string }
  ): Promise<PersonalTodo> {
    const title = (body.title ?? "").trim();
    if (!title) throw new BadRequestException("Görev başlığı boş olamaz");

    const status = this.assertStatus(body.status ?? "todo");
    const priority = clampPriority(body.priority);

    // Yeni kart kolonun EN SONUNA gelir: en büyük sort_order'ın bir üstü.
    // Üste eklendiğinde, arka arkaya görev yazan kullanıcının az önce eklediği
    // kart aşağı kayıyor ve liste her Enter'da yerinden oynuyordu.
    //
    // Sadece personal_todos'a değil panonun tamamına bakıyoruz: kullanıcı o
    // kolonda bir kez sürükleme yaptıysa kişisel ve atanan kartlar tek bir
    // numaralandırmayı paylaşır, yalnızca kişisel olanların maksimumunu almak
    // yeni kartı listenin ortasına düşürürdü. Hiç dokunulmamış atanan görevler
    // sentinel (1000000) taşıdığı için onlar hesaba katılmaz.
    const { data: last } = await this.supabase.client
      .from("v_personal_board")
      .select("sort_order")
      .eq("board_user_id", userId)
      .eq("status", status)
      .lt("sort_order", 1000000)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await this.supabase.client
      .from("personal_todos")
      .insert({
        user_id: userId,
        title,
        description: body.description?.trim() || null,
        status,
        priority,
        color: body.color || null,
        due_date: body.dueDate || null,
        sort_order: (last?.sort_order ?? -1) + 1,
        // status='completed' ile completed_at arasındaki tutarlılık veritabanında
        // CHECK ile zorunlu; burada da aynı kuralı uyguluyoruz.
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapTodo(data);
  }

  async update(
    userId: string,
    id: string,
    body: { title?: string; description?: string; status?: TaskStatus; priority?: number; color?: string | null; dueDate?: string | null }
  ): Promise<PersonalTodo> {
    const patch: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) throw new BadRequestException("Görev başlığı boş olamaz");
      patch.title = title;
    }
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.priority !== undefined) patch.priority = clampPriority(body.priority);
    if (body.color !== undefined) patch.color = body.color || null;
    if (body.dueDate !== undefined) patch.due_date = body.dueDate || null;
    if (body.status !== undefined) {
      const status = this.assertStatus(body.status);
      patch.status = status;
      patch.completed_at = status === "completed" ? new Date().toISOString() : null;
    }

    if (Object.keys(patch).length === 0) return this.findOne(userId, id);

    const { data, error } = await this.supabase.client
      .from("personal_todos")
      .update(patch)
      .eq("id", id)
      // Sahiplik kontrolü: sadece "id" ile güncellemek yeterli DEĞİL.
      .eq("user_id", userId)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Görev bulunamadı");
    return mapTodo(data);
  }

  async findOne(userId: string, id: string): Promise<PersonalTodo> {
    const { data, error } = await this.supabase.client
      .from("personal_todos")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Görev bulunamadı");
    return mapTodo(data);
  }

  /** Kalıcı silme değil: arşivlenir, böylece yanlışlıkla silme geri alınabilir. */
  async archive(userId: string, id: string): Promise<{ ok: true }> {
    const { data, error } = await this.supabase.client
      .from("personal_todos")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Görev bulunamadı");
    return { ok: true };
  }

  async restore(userId: string, id: string): Promise<PersonalTodo> {
    const { data, error } = await this.supabase.client
      .from("personal_todos")
      .update({ archived_at: null })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Görev bulunamadı");
    return mapTodo(data);
  }

  // ----------------------------------------------- Durum değişikliği / sıralama
  //
  // Bu iki uç nokta, proje/departman kanbanlarındaki `PATCH /tasks/:id/status`
  // ve `PATCH /tasks/reorder` ile aynı sözleşmeyi taşır — Yapılacaklar sayfası
  // da aynı TaskColumn bileşenini kullandığı için ikisi birebir eşleşmeli.

  /**
   * Kartın durumunu (kolonunu) değiştirir.
   *
   * "assigned" kaynaklı bir kartta görevin GERÇEK durumu değişir, yani projeye
   * yansır — kullanıcı zaten bunu bekler. Sıra, kişisel not ve kişisel tarih
   * hiçbir zaman yansımaz.
   */
  async setStatus(
    userId: string,
    body: { source?: string; itemId?: string; status?: string }
  ): Promise<{ ok: true }> {
    const source = this.assertSource(body.source);
    if (!body.itemId) throw new BadRequestException("itemId zorunlu");
    const status = this.assertStatus(body.status as TaskStatus);
    const now = new Date().toISOString();

    if (source === "personal") {
      const { data, error } = await this.supabase.client
        .from("personal_todos")
        .update({
          status,
          // status='completed' ile completed_at arasındaki tutarlılık veritabanında
          // CHECK ile zorunlu; ikisini birlikte yazmazsak insert reddedilir.
          completed_at: status === "completed" ? now : null,
        })
        .eq("id", body.itemId)
        .eq("user_id", userId)
        .is("archived_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new NotFoundException("Görev bulunamadı");
      return { ok: true };
    }

    const { data, error } = await this.supabase.client
      .from("tasks")
      .update({
        status,
        completed_at: status === "completed" ? now : null,
        completed_by: status === "completed" ? userId : null,
      })
      .eq("id", body.itemId)
      .eq("assigned_to", userId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Görev bulunamadı veya size atanmamış");
    return { ok: true };
  }

  /**
   * Bir kolonun nihai sırasını yazar. `items` dizisindeki sıra sort_order olur.
   *
   * Sahiplik doğrulaması `personal_board_reorder` içindedir: başkasının kaydı
   * listeye sokulsa bile yazılmaz, sessizce atlanır.
   */
  async reorder(userId: string, items: { source?: string; itemId?: string }[]): Promise<{ ok: true }> {
    if (!Array.isArray(items) || items.length === 0) return { ok: true };

    const payload = items.map((i) => {
      const source = this.assertSource(i.source);
      if (!i.itemId) throw new BadRequestException("itemId zorunlu");
      return { source, id: i.itemId };
    });

    const { error } = await this.supabase.client.rpc("personal_board_reorder", {
      p_user_id: userId,
      p_items: payload,
    });
    if (error) {
      if (error.code === "22023") throw new BadRequestException(error.message);
      throw error;
    }
    return { ok: true };
  }

  /**
   * Panodaki bir "assigned" kartın TAM görev kaydı.
   *
   * Panonun kendisi görevin yalnızca kart için gereken alanlarını taşır. Görev
   * düzenleyicisi ise atanan kişi, bütçe ve tahmini süre gibi alanları da yazar —
   * eksik bir kayıtla açılırsa kaydederken bunları siler. Bu yüzden düzenleyici
   * açılmadan önce görev buradan tam olarak çekilir.
   *
   * Genel amaçlı bir GET /tasks/:id yerine burada duruyor: yetki kuralı tek ve
   * dar — görev istekte bulunan kullanıcıya atanmış olmalı.
   */
  async findAssignedTask(userId: string, taskId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select(
        "*, completed_by_user:users!tasks_completed_by_fkey(full_name), assigned_user:users!tasks_assigned_to_fkey(full_name), projects(title)"
      )
      .eq("id", taskId)
      .eq("assigned_to", userId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Görev bulunamadı veya size atanmamış");
    return mapTask(data);
  }

  // ------------------------------------------- Atanan görevin kişisel katmanı

  /**
   * Atanan bir görevin yalnızca kullanıcıya görünen alanlarını günceller.
   * `tasks` tablosuna dokunmaz.
   */
  async updateAssignedPrefs(
    userId: string,
    taskId: string,
    body: { personalNote?: string | null; personalDueDate?: string | null; isPinned?: boolean; isHidden?: boolean }
  ): Promise<{ ok: true }> {
    // Görevin gerçekten bu kullanıcıya atanmış olduğunu doğrula; aksi halde
    // herhangi bir task id'si için pref satırı yazılabilirdi.
    const { data: task, error: taskError } = await this.supabase.client
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .eq("assigned_to", userId)
      .is("archived_at", null)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) throw new NotFoundException("Görev bulunamadı veya size atanmamış");

    const patch: Record<string, unknown> = { user_id: userId, task_id: taskId };
    if (body.personalNote !== undefined) patch.personal_note = body.personalNote?.trim() || null;
    if (body.personalDueDate !== undefined) patch.personal_due_date = body.personalDueDate || null;
    if (body.isPinned !== undefined) patch.is_pinned = body.isPinned;
    if (body.isHidden !== undefined) patch.is_hidden = body.isHidden;

    const { error } = await this.supabase.client
      .from("personal_task_prefs")
      .upsert(patch, { onConflict: "user_id,task_id" });
    if (error) throw error;
    return { ok: true };
  }

  // ------------------------------------------------------------ Yardımcılar

  private assertSource(value: string | undefined): PersonalBoardSource {
    if (value !== "personal" && value !== "assigned") throw new BadRequestException("Geçersiz kaynak");
    return value;
  }

  private assertStatus(value: TaskStatus | string | undefined): TaskStatus {
    if (!value || !STATUSES.includes(value as TaskStatus)) {
      throw new BadRequestException("Geçersiz durum");
    }
    return value as TaskStatus;
  }

}

/** tasks satırını paylaşılan Task şekline çevirir (bkz. TasksService.mapTask). */
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
    priority: (row.priority ?? 0) as TaskPriority,
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

/**
 * Öncelik yıldızı 0-5. Aralık dışı bir değer DB'deki CHECK'e takılıp 500
 * dönerdi; burada sınırlayıp anlamlı bir kayda çeviriyoruz.
 */
function clampPriority(value: unknown): TaskPriority {
  const n = Math.trunc(Number(value) || 0);
  return Math.min(5, Math.max(0, n)) as TaskPriority;
}

function mapTodo(row: any): PersonalTodo {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: (row.priority ?? 0) as TaskPriority,
    color: row.color ?? undefined,
    dueDate: row.due_date ?? undefined,
    sortOrder: row.sort_order ?? 0,
    completedAt: row.completed_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBoardItem(row: any): PersonalBoardItem {
  return {
    itemId: row.item_id,
    source: row.source,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: (row.priority ?? 0) as TaskPriority,
    color: row.color ?? undefined,
    effectiveDueDate: row.effective_due_date ?? undefined,
    projectDeadline: row.project_deadline ?? undefined,
    sortOrder: row.sort_order ?? 0,
    isPinned: Boolean(row.is_pinned),
    isHidden: Boolean(row.is_hidden),
    personalNote: row.personal_note ?? undefined,
    projectId: row.project_id ?? undefined,
    projectTitle: row.project_title ?? undefined,
    operationId: row.operation_id ?? undefined,
    operationTitle: row.operation_title ?? undefined,
    departmentId: row.department_id ?? undefined,
    departmentName: row.department_name ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}
