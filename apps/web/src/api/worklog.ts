import type { WorkLogEntry, WorkLogPushResult, WorkLogSummary, WorkLogTargetKind } from "@projelio/shared";
import { api } from "./client";

export interface WorkLogInput {
  title?: string;
  note?: string | null;
  /** Yerel duvar saati ("YYYY-MM-DDTHH:MM"). Sunucu gün defterini buna göre kuruyor. */
  doneAt?: string;
  /** Serbest yazım: "45", "1s 30dk", "2 saat", "1:30". Boş dize = süreyi sil. */
  duration?: string | number | null;
  /**
   * Saat aralığı (yerel duvar saati). İkisi birlikte gönderilir; verilirse süre
   * sunucuda ONDAN hesaplanır ve `duration` yok sayılır. null göndermek aralığı
   * temizler (süreyi silmez).
   */
  startedAt?: string | null;
  endedAt?: string | null;
}

/** Kaydı sistemde KAYITLI bir göreve/alt göreve bağlayan alanlar. */
export interface WorkLogTaskInput {
  taskId?: string;
  /** Görev kendi panosunda da "tamamlandı"ya çekilsin mi. */
  markTaskDone?: boolean;
  /** Yapılan iş takvime "yapıldı" bloğu olarak işlensin mi. */
  addToCalendar?: boolean;
}

export interface WorkLogLinkInput {
  /** null gönderilirse bağlantı koparılır. */
  targetKind?: WorkLogTargetKind | null;
  targetId?: string | null;
  targetLabel?: string | null;
  /** Hedefin uygulama içi adresi; listede bağlantıyı tıklanabilir yapan şey. */
  targetPath?: string | null;
}

export interface WorkLogPushInput {
  kind: "task" | "personal_todo" | "budget" | "module_record";
  projectId?: string;
  departmentId?: string;
  outputId?: string;
  organizationId?: string;
  moduleKey?: string;
  recordData?: Record<string, unknown>;
  amount?: number;
  transactionType?: "income" | "expense";
}

function aralik(from?: string, to?: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const q = params.toString();
  return q ? `?${q}` : "";
}

/** Yaptım — kişisel iş günlüğü (backend: modules/worklog). */
export const worklog = {
  list: (opts: { from?: string; to?: string; unlinkedOnly?: boolean } = {}, signal?: AbortSignal) =>
    api.get<WorkLogEntry[]>(
      `/worklog${aralik(opts.from, opts.to, opts.unlinkedOnly ? { unlinkedOnly: "true" } : {})}`,
      signal
    ),

  summary: (opts: { from?: string; to?: string } = {}, signal?: AbortSignal) =>
    api.get<WorkLogSummary>(`/worklog/summary${aralik(opts.from, opts.to)}`, signal),

  /** O an kronometresi çalışan kayıt; yoksa null. */
  running: (signal?: AbortSignal) => api.get<WorkLogEntry | null>("/worklog/running", signal),

  create: (body: WorkLogInput & WorkLogLinkInput & WorkLogTaskInput) => api.post<WorkLogEntry>("/worklog", body),
  update: (id: string, body: WorkLogInput) => api.patch<WorkLogEntry>(`/worklog/${id}`, body),

  /** Kaydı bir yere iliştirir; targetKind null ise bağlantıyı koparır. */
  link: (id: string, body: WorkLogLinkInput) => api.patch<WorkLogEntry>(`/worklog/${id}/link`, body),

  /** Kaydı hedefte GERÇEK bir kayda dönüştürür (görev, kasa hareketi, modül kaydı…). */
  push: (id: string, body: WorkLogPushInput) => api.post<WorkLogPushResult>(`/worklog/${id}/push`, body),

  startTimer: (id: string) => api.post<WorkLogEntry>(`/worklog/${id}/timer/start`, {}),
  stopTimer: (id: string) => api.post<WorkLogEntry>(`/worklog/${id}/timer/stop`, {}),

  /** Kalıcı silmez, arşivler. */
  archive: (id: string) => api.delete<{ ok: true }>(`/worklog/${id}`),
  restore: (id: string) => api.patch<WorkLogEntry>(`/worklog/${id}/restore`, {}),
};
