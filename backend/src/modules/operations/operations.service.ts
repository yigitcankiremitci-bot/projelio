import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  Operation,
  OperationOccurrence,
  OperationRoutine,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { removeStaleUploadsInFolder } from "../../common/storage/public-upload.util";
import { applyOrder } from "../../common/reorder.util";
import { detectImageUpload } from "../../common/upload-image.util";

const COVER_BUCKET = "project-covers";

function mapOperation(row: any, health?: any): Operation {
  return {
    id: row.id,
    jobId: row.job_id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    status: row.status,
    startedOn: row.started_on,
    endedOn: row.ended_on ?? undefined,
    budgetPerPeriod: Number(row.budget_per_period ?? 0),
    budgetPeriod: row.budget_period ?? "monthly",
    timezone: row.timezone ?? "Europe/Istanbul",
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
    activeRoutineCount: health ? Number(health.active_routine_count ?? 0) : undefined,
    dueCount: health ? Number(health.due_count ?? 0) : undefined,
    doneCount: health ? Number(health.done_count ?? 0) : undefined,
    missedCount: health ? Number(health.missed_count ?? 0) : undefined,
    upcomingCount: health ? Number(health.upcoming_count ?? 0) : undefined,
    adherencePct: health?.adherence_pct != null ? Number(health.adherence_pct) : undefined,
    nextDueOn: health?.next_due_on ?? undefined,
    health: health?.health ?? undefined,
  };
}

function mapRoutine(row: any, stats?: any): OperationRoutine {
  return {
    id: row.id,
    operationId: row.operation_id,
    title: row.title,
    description: row.description ?? undefined,
    defaultAssignee: row.default_assignee ?? undefined,
    defaultAssigneeName: row.assignee?.full_name ?? undefined,
    freq: row.freq,
    intervalN: row.interval_n ?? 1,
    byWeekday: row.byweekday ?? undefined,
    byMonthDay: row.bymonthday ?? undefined,
    bySetPos: row.bysetpos ?? undefined,
    byMonth: row.bymonth ?? undefined,
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? undefined,
    maxOccurrences: row.max_occurrences ?? undefined,
    dueTime: (row.due_time ?? "18:00:00").slice(0, 5),
    leadDays: row.lead_days ?? 0,
    graceDays: row.grace_days ?? 0,
    generateAheadDays: row.generate_ahead_days ?? 30,
    budget: Number(row.budget ?? 0),
    active: row.active !== false,
    sortOrder: row.sort_order ?? 0,
    archivedAt: row.archived_at ?? undefined,
    lastMaterializedOn: row.last_materialized_on ?? undefined,
    createdAt: row.created_at,
    dueCount: stats ? Number(stats.due_count ?? 0) : undefined,
    doneCount: stats ? Number(stats.done_count ?? 0) : undefined,
    skippedCount: stats ? Number(stats.skipped_count ?? 0) : undefined,
    missedCount: stats ? Number(stats.missed_count ?? 0) : undefined,
    upcomingCount: stats ? Number(stats.upcoming_count ?? 0) : undefined,
    adherencePct: stats?.adherence_pct != null ? Number(stats.adherence_pct) : undefined,
    adherence90dPct: stats?.adherence_90d_pct != null ? Number(stats.adherence_90d_pct) : undefined,
    currentStreak: stats?.current_streak != null ? Number(stats.current_streak) : undefined,
    nextDueOn: stats?.next_due_on ?? undefined,
    lastDoneOn: stats?.last_done_on ?? undefined,
  };
}

function mapOccurrence(row: any): OperationOccurrence {
  return {
    id: row.id,
    operationId: row.operation_id,
    routineId: row.routine_id,
    routineTitle: row.routine?.title ?? undefined,
    occurrenceOn: row.occurrence_on,
    title: row.title,
    description: row.description ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    assignedToName: row.assigned_user?.full_name ?? undefined,
    deadline: row.deadline,
    status: row.status,
    budget: row.budget != null ? Number(row.budget) : 0,
    budgetStatus: row.budget_status ?? "pending",
    completedAt: row.completed_at ?? undefined,
    completedBy: row.completed_by ?? undefined,
    skippedAt: row.skipped_at ?? undefined,
    createdAt: row.created_at,
    attachments: Array.isArray(row.task_attachments)
      ? row.task_attachments.map((a: any) => ({
          id: a.id,
          taskId: row.id,
          kind: a.kind,
          url: a.url,
          label: a.label ?? undefined,
          createdAt: row.created_at,
        }))
      : undefined,
    // Drive/OneDrive dosyaları ayrı tabloda yaşar (bkz. files); satırdaki dosya
    // rozetinin hedefi bu liste.
    files: Array.isArray(row.files)
      ? row.files.map((f: any) => ({ id: f.id, name: f.name, webViewLink: f.web_view_link ?? undefined }))
      : undefined,
  };
}

// Boş dizi göndermek "hiç kısıt yok" ile karıştırılmasın diye null'a çevrilir.
function normalizeIntArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const nums = value.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums : null;
}

@Injectable()
export class OperationsService {
  constructor(private supabase: SupabaseService) {}

  // ---------------------------------------------------------------- rutinler

  private async healthByIds(ids: string[]): Promise<Map<string, any>> {
    if (ids.length === 0) return new Map();
    const { data } = await this.supabase.client
      .from("operation_health")
      .select()
      .in("operation_id", ids);
    return new Map((data ?? []).map((h: any) => [h.operation_id, h]));
  }

  async findAllForUser(userId: string): Promise<Operation[]> {
    const { data: owned, error } = await this.supabase.client
      .from("operations")
      .select()
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (error) throw error;

    const { data: memberships } = await this.supabase.client
      .from("operation_members")
      .select("operation_id")
      .eq("user_id", userId)
      .eq("status", "approved");

    const memberIds = (memberships ?? []).map((m: any) => m.operation_id);
    let memberRows: any[] = [];
    if (memberIds.length > 0) {
      const { data } = await this.supabase.client
        .from("operations")
        .select()
        .in("id", memberIds)
        .is("archived_at", null);
      memberRows = data ?? [];
    }

    const byId = new Map<string, any>();
    for (const row of [...(owned ?? []), ...memberRows]) byId.set(row.id, row);
    const rows = Array.from(byId.values());
    const health = await this.healthByIds(rows.map((r) => r.id));

    return rows
      .map((r) => mapOperation(r, health.get(r.id)))
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  // Görünürlük kuralı projelerdekiyle aynı: iş sahibi ve iş ekibi tüm rutinleri
  // görür; dışarıdakiler yalnızca sahibi oldukları ya da ekibinde bulundukları
  // rutinleri görebilir.
  async findByJob(jobId: string, requestingUserId?: string): Promise<Operation[]> {
    const { data, error } = await this.supabase.client
      .from("operations")
      .select()
      .eq("job_id", jobId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = data ?? [];
    const health = await this.healthByIds(rows.map((r: any) => r.id));
    const operations = rows.map((r: any) => mapOperation(r, health.get(r.id)));
    if (!requestingUserId) return operations;

    const { data: job } = await this.supabase.client
      .from("jobs")
      .select("owner_id")
      .eq("id", jobId)
      .maybeSingle();
    if (job?.owner_id === requestingUserId) return operations;

    const { data: jobMember } = await this.supabase.client
      .from("job_members")
      .select("id")
      .eq("job_id", jobId)
      .eq("user_id", requestingUserId)
      // Yalnızca daveti kabul etmiş iş ekibi üyeleri (bkz. job_members.status).
      .eq("status", "approved")
      .maybeSingle();
    if (jobMember) return operations;

    const { data: memberships } = await this.supabase.client
      .from("operation_members")
      .select("operation_id")
      .eq("user_id", requestingUserId)
      .eq("status", "approved");
    const memberIds = new Set((memberships ?? []).map((m: any) => m.operation_id));
    return operations.filter((o) => o.ownerId === requestingUserId || memberIds.has(o.id));
  }

  async findOne(id: string): Promise<Operation> {
    const { data, error } = await this.supabase.client
      .from("operations")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Rutin bulunamadı");
    const health = await this.healthByIds([id]);
    return mapOperation(data, health.get(id));
  }

  async create(ownerId: string, data: Partial<Operation>): Promise<Operation> {
    if (!data.jobId) throw new BadRequestException("Rutin bir işe bağlı olmalı");
    const { data: row, error } = await this.supabase.client
      .from("operations")
      .insert({
        owner_id: ownerId,
        job_id: data.jobId,
        title: data.title ?? "",
        description: data.description ?? null,
        budget_per_period: data.budgetPerPeriod ?? 0,
        budget_period: data.budgetPeriod ?? "monthly",
        started_on: (data.startedOn ?? new Date().toISOString()).slice(0, 10),
        timezone: data.timezone ?? "Europe/Istanbul",
      })
      .select()
      .single();
    if (error) throw error;
    return mapOperation(row);
  }

  private async assertCanManage(id: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: operation } = await this.supabase.client
      .from("operations")
      .select("owner_id, job_id")
      .eq("id", id)
      .maybeSingle();
    if (!operation) throw new NotFoundException("Rutin bulunamadı");
    if (operation.owner_id === userId) return;
    if (operation.job_id) {
      const { data: job } = await this.supabase.client
        .from("jobs")
        .select("owner_id")
        .eq("id", operation.job_id)
        .maybeSingle();
      if (job?.owner_id === userId) return;
    }
    throw new ForbiddenException("Bu rutini yalnızca rutin veya iş sahibi düzenleyebilir");
  }

  async update(id: string, data: Partial<Operation>, requestingUserId?: string): Promise<Operation> {
    await this.assertCanManage(id, requestingUserId);
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.budgetPerPeriod !== undefined) patch.budget_per_period = data.budgetPerPeriod;
    if (data.budgetPeriod !== undefined) patch.budget_period = data.budgetPeriod;
    if (data.startedOn !== undefined) patch.started_on = data.startedOn.slice(0, 10);
    if (data.timezone !== undefined) patch.timezone = data.timezone;
    if (data.coverImageUrl !== undefined) patch.cover_image_url = data.coverImageUrl;

    // Rutin "tamamlanmaz": kapatılırken bitiş tarihi zorunludur, tekrar
    // açıldığında bitiş tarihi temizlenir.
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "ended") {
        patch.ended_on = (data.endedOn ?? new Date().toISOString()).slice(0, 10);
      } else {
        patch.ended_on = null;
      }
    } else if (data.endedOn !== undefined) {
      patch.ended_on = data.endedOn ? data.endedOn.slice(0, 10) : null;
    }

    const { data: row, error } = await this.supabase.client
      .from("operations")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Rutin bulunamadı");
    return mapOperation(row);
  }

  async reorder(userId: string, ids: string[]): Promise<void> {
    if (!ids?.length) return;
    const { data: rows, error } = await this.supabase.client
      .from("operations")
      .select("id, owner_id, job_id")
      .in("id", ids);
    if (error) throw error;
    if (!rows || rows.length !== ids.length) throw new BadRequestException("Geçersiz sıralama isteği");
    if (new Set(rows.map((r: any) => r.job_id)).size > 1) {
      throw new BadRequestException("Sıralanan rutinler aynı işe ait olmalı");
    }
    if (!rows.every((r: any) => r.owner_id === userId)) {
      const jobId = rows[0].job_id;
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", jobId).maybeSingle();
      if (job?.owner_id !== userId) {
        const { data: member } = await this.supabase.client
          .from("job_members")
          .select("id")
          .eq("job_id", jobId)
          .eq("user_id", userId)
          .eq("status", "approved")
          .maybeSingle();
        if (!member) throw new BadRequestException("Geçersiz sıralama isteği");
      }
    }
    await applyOrder(this.supabase.client, "operations", ids);
  }

  async remove(id: string, requestingUserId?: string): Promise<void> {
    await this.assertCanManage(id, requestingUserId);
    const { error } = await this.supabase.client.from("operations").delete().eq("id", id);
    if (error) throw error;
  }

  // Arşivleme rutini durdurur: veritabanı tetikleyicisi gelecekteki, henüz
  // dokunulmamış tekrarları otomatik olarak geri çeker. Geçmiş kayıtlar durur.
  async archive(id: string, requestingUserId?: string): Promise<Operation> {
    await this.assertCanManage(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("operations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Rutin bulunamadı");
    return mapOperation(row);
  }

  async restore(id: string, requestingUserId?: string): Promise<Operation> {
    await this.assertCanManage(id, requestingUserId);
    const { data: row, error } = await this.supabase.client
      .from("operations")
      .update({ archived_at: null })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Rutin bulunamadı");
    return mapOperation(row);
  }

  async uploadCover(id: string, file: Express.Multer.File, requestingUserId?: string): Promise<Operation> {
    await this.assertCanManage(id, requestingUserId);
    // Tur ve uzanti istemcinin sozune degil, dosyanin ilk baytlarindaki
    // imzaya gore belirlenir (bkz. common/upload-image.util.ts).
    const { contentType, ext } = detectImageUpload(file);
    const path = `operations/${id}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(COVER_BUCKET)
      .upload(path, file.buffer, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = this.supabase.client.storage.from(COVER_BUCKET).getPublicUrl(path);
    const updated = await this.update(id, { coverImageUrl: publicUrlData.publicUrl });

    // Kayıt güncellendikten SONRA temizle: güncelleme başarısız olursa eski görsel
    // yerinde kalsın, kayıt silinmiş bir dosyaya işaret etmesin.
    await removeStaleUploadsInFolder(this.supabase.client, COVER_BUCKET, path);

    return updated;
  }

  // ------------------------------------------------------------------ rutinler

  async findRoutines(operationId: string): Promise<OperationRoutine[]> {
    const { data, error } = await this.supabase.client
      .from("operation_routines")
      .select("*, assignee:users!operation_routines_default_assignee_fkey(full_name)")
      .eq("operation_id", operationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;

    const rows = data ?? [];
    const { data: stats } = await this.supabase.client
      .from("operation_routine_stats")
      .select()
      .eq("operation_id", operationId);
    const statsById = new Map((stats ?? []).map((s: any) => [s.routine_id, s]));

    return rows.map((r: any) => mapRoutine(r, statsById.get(r.id)));
  }

  private routinePatch(data: Partial<OperationRoutine>): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.defaultAssignee !== undefined) patch.default_assignee = data.defaultAssignee || null;
    if (data.freq !== undefined) patch.freq = data.freq;
    if (data.intervalN !== undefined) patch.interval_n = Math.max(1, Number(data.intervalN) || 1);
    if (data.byWeekday !== undefined) patch.byweekday = normalizeIntArray(data.byWeekday);
    if (data.byMonthDay !== undefined) patch.bymonthday = normalizeIntArray(data.byMonthDay);
    if (data.bySetPos !== undefined) patch.bysetpos = data.bySetPos ?? null;
    if (data.byMonth !== undefined) patch.bymonth = normalizeIntArray(data.byMonth);
    if (data.startsOn !== undefined) patch.starts_on = data.startsOn.slice(0, 10);
    if (data.endsOn !== undefined) patch.ends_on = data.endsOn ? data.endsOn.slice(0, 10) : null;
    if (data.maxOccurrences !== undefined) patch.max_occurrences = data.maxOccurrences || null;
    if (data.dueTime !== undefined) patch.due_time = data.dueTime;
    if (data.leadDays !== undefined) patch.lead_days = Math.max(0, Number(data.leadDays) || 0);
    if (data.graceDays !== undefined) patch.grace_days = Math.max(0, Number(data.graceDays) || 0);
    if (data.generateAheadDays !== undefined) {
      patch.generate_ahead_days = Math.min(365, Math.max(1, Number(data.generateAheadDays) || 30));
    }
    if (data.budget !== undefined) patch.budget = Number(data.budget) || 0;
    if (data.active !== undefined) patch.active = data.active;

    // "Ayın N. günü" ile "ayın N. haftasının X günü" birbirini dışlar; kullanıcı
    // birinden diğerine geçtiğinde eski alanın kalıntısı kural bozmasın diye temizlenir.
    if (patch.bysetpos != null && data.freq === "monthly") patch.bymonthday = null;
    if (data.freq !== undefined && data.freq !== "monthly") patch.bysetpos = null;

    return patch;
  }

  async createRoutine(operationId: string, data: Partial<OperationRoutine>, userId?: string): Promise<OperationRoutine> {
    await this.assertCanManage(operationId, userId);
    const patch = this.routinePatch(data);
    const { data: row, error } = await this.supabase.client
      .from("operation_routines")
      .insert({
        operation_id: operationId,
        title: data.title ?? "",
        freq: data.freq ?? "weekly",
        starts_on: (data.startsOn ?? new Date().toISOString()).slice(0, 10),
        ...patch,
      })
      .select()
      .single();
    if (error) throw error;
    // Tekrarlar veritabanı tetikleyicisi tarafından otomatik açılır.
    return mapRoutine(row);
  }

  private async routineOperationId(routineId: string): Promise<string> {
    const { data } = await this.supabase.client
      .from("operation_routines")
      .select("operation_id")
      .eq("id", routineId)
      .maybeSingle();
    if (!data) throw new NotFoundException("Rutin bulunamadı");
    return data.operation_id;
  }

  async updateRoutine(routineId: string, data: Partial<OperationRoutine>, userId?: string): Promise<OperationRoutine> {
    await this.assertCanManage(await this.routineOperationId(routineId), userId);
    const { data: row, error } = await this.supabase.client
      .from("operation_routines")
      .update(this.routinePatch(data))
      .eq("id", routineId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Rutin bulunamadı");
    return mapRoutine(row);
  }

  async removeRoutine(routineId: string, userId?: string): Promise<void> {
    await this.assertCanManage(await this.routineOperationId(routineId), userId);
    const { error } = await this.supabase.client.from("operation_routines").delete().eq("id", routineId);
    if (error) throw error;
  }

  // Rutin daha kaydedilmeden, formdaki kurala göre sıradaki tarihleri gösterir.
  async previewRoutineDates(data: Partial<OperationRoutine>, limit = 8): Promise<string[]> {
    const from = (data.startsOn ? new Date(data.startsOn) : new Date()).toISOString().slice(0, 10);
    const horizon = new Date();
    horizon.setFullYear(horizon.getFullYear() + 2);

    const { data: rows, error } = await this.supabase.client.rpc("expand_recurrence", {
      p_freq: data.freq ?? "weekly",
      p_interval_n: Math.max(1, Number(data.intervalN) || 1),
      p_byweekday: normalizeIntArray(data.byWeekday),
      p_bymonthday: normalizeIntArray(data.byMonthDay),
      p_bysetpos: data.bySetPos ?? null,
      p_bymonth: normalizeIntArray(data.byMonth),
      p_starts_on: from,
      p_ends_on: data.endsOn ? data.endsOn.slice(0, 10) : null,
      p_from: from,
      p_to: horizon.toISOString().slice(0, 10),
    });
    if (error) throw error;

    const dates = (rows ?? []) as unknown as (string | { expand_recurrence: string })[];
    return dates
      .map((d) => (typeof d === "string" ? d : d.expand_recurrence))
      .filter(Boolean)
      .slice(0, limit);
  }

  // ----------------------------------------------------------------- tekrarlar

  async findOccurrences(operationId: string, from?: string, to?: string): Promise<OperationOccurrence[]> {
    let query = this.supabase.client
      .from("tasks")
      .select(
        // Ekler de geliyor: listedeki satır "link/dosya var mı" rozetini
        // gösterebilsin diye (bkz. 060). Ayrı bir istek atmak, her tekrar için
        // bir sorgu demek olurdu.
        "*, assigned_user:users!tasks_assigned_to_fkey(full_name), routine:operation_routines(title), task_attachments(id, kind, url, label), files(id, name, web_view_link)"
      )
      .eq("operation_id", operationId)
      .is("archived_at", null);

    if (from) query = query.gte("occurrence_on", from.slice(0, 10));
    if (to) query = query.lte("occurrence_on", to.slice(0, 10));

    const { data, error } = await query
      .order("occurrence_on", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapOccurrence);
  }

  private async occurrenceOperationId(occurrenceId: string): Promise<string> {
    const { data } = await this.supabase.client
      .from("tasks")
      .select("operation_id")
      .eq("id", occurrenceId)
      .maybeSingle();
    if (!data?.operation_id) throw new NotFoundException("Tekrar bulunamadı");
    return data.operation_id;
  }

  async setOccurrenceStatus(occurrenceId: string, status: string, userId?: string): Promise<OperationOccurrence> {
    if (!["todo", "in_progress", "completed"].includes(status)) {
      throw new BadRequestException("Geçersiz durum");
    }
    await this.assertCanManage(await this.occurrenceOperationId(occurrenceId), userId);
    const completing = status === "completed";
    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({
        status,
        completed_at: completing ? new Date().toISOString() : null,
        completed_by: completing ? userId ?? null : null,
        // Tamamlanan bir tekrar artık "atlanmış" sayılmaz.
        skipped_at: completing ? null : undefined,
      })
      .eq("id", occurrenceId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Tekrar bulunamadı");
    return mapOccurrence(row);
  }

  // Bilinçli atlama: kaçırılmış sayılmaz, uyum oranında paydaya girmez, seriyi bozmaz.
  async setOccurrenceSkipped(occurrenceId: string, skipped: boolean, userId?: string): Promise<OperationOccurrence> {
    await this.assertCanManage(await this.occurrenceOperationId(occurrenceId), userId);
    const { data: row, error } = await this.supabase.client
      .from("tasks")
      .update({ skipped_at: skipped ? new Date().toISOString() : null })
      .eq("id", occurrenceId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Tekrar bulunamadı");
    return mapOccurrence(row);
  }
}
