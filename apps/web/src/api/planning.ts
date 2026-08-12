import type {
  PlanBlockStatus,
  PlanCalendarView,
  PlanFocusArea,
  PlanPeriod,
  PlanPeriodKind,
  PlanPeriodProgress,
  PlanPreferences,
  PlanRitual,
  PlanRitualPrompt,
  PlanTarget,
  PlanTimeBlock,
  SchedulableTask,
} from "@projelio/shared";
import { api } from "./client";

export interface PlanBlockInput {
  blockDate?: string;
  startsAt?: string;
  endsAt?: string;
  title?: string;
  note?: string;
  color?: string;
  focusAreaId?: string | null;
  taskId?: string | null;
  personalTodoId?: string | null;
  source?: "manual" | "lio" | "routine";
}

export interface PlanTargetInput {
  focusAreaId?: string;
  title?: string;
  sharePct?: number;
  targetMinutes?: number;
  targetCount?: number;
  unit?: string;
}

export interface PlanSuggestionResult {
  periodId: string;
  from: string;
  to: string;
  capacityMinutes: number;
  proposedCount: number;
  proposedMinutes: number;
  applied: boolean;
  blocks: PlanTimeBlock[];
  /** Takvimde yer kalmadığı için karşılanamayan süre. */
  shortfall: { focusAreaId: string; focusAreaName?: string; minutes: number }[];
}

/** Takvim / kişisel planlama uç noktaları (backend: modules/planning). */
export const planning = {
  // Görünüm
  getCalendar: (kind: PlanPeriodKind, date: string) =>
    api.get<PlanCalendarView>(`/planning/calendar?kind=${kind}&date=${date}`),
  getProgress: (kind: PlanPeriodKind, date: string) =>
    api.get<PlanPeriodProgress>(`/planning/progress?kind=${kind}&date=${date}`),

  /**
   * Takvime sürüklenebilecek görevler — erişilen tüm proje ve programlardan.
   * Takvim yükünü şişirmemek için ayrı uç noktada; arayüz ilgili sekmeye
   * geçilince çekiyor.
   */
  listSchedulableTasks: (query?: string) =>
    api.get<SchedulableTask[]>(`/planning/schedulable-tasks${query ? `?query=${encodeURIComponent(query)}` : ""}`),

  // Tercihler
  getPreferences: () => api.get<PlanPreferences>("/planning/preferences"),
  updatePreferences: (body: Partial<PlanPreferences>) =>
    api.patch<PlanPreferences>("/planning/preferences", body),

  // Odak alanları
  listFocusAreas: () => api.get<PlanFocusArea[]>("/planning/focus-areas"),
  createFocusArea: (body: { name: string; color?: string; jobId?: string }) =>
    api.post<PlanFocusArea>("/planning/focus-areas", body),
  updateFocusArea: (id: string, body: { name?: string; color?: string | null; jobId?: string | null }) =>
    api.patch<PlanFocusArea>(`/planning/focus-areas/${id}`, body),
  archiveFocusArea: (id: string) => api.delete<{ ok: true }>(`/planning/focus-areas/${id}`),
  reorderFocusAreas: (ids: string[]) => api.patch<{ ok: true }>("/planning/focus-areas/reorder", { ids }),

  // Dönemler
  getPeriod: (kind: PlanPeriodKind, date: string) =>
    api.get<PlanPeriod>(`/planning/periods?kind=${kind}&date=${date}`),
  updatePeriod: (
    id: string,
    body: { theme?: string | null; note?: string | null; reviewNote?: string | null; capacityMinutes?: number | null; status?: string }
  ) => api.patch<PlanPeriod>(`/planning/periods/${id}`, body),

  // Hedefler — gövde dönemin YENİ TAM HÂLİDİR, listede olmayan hedefler silinir.
  setTargets: (periodId: string, targets: PlanTargetInput[]) =>
    api.post<PlanTarget[]>(`/planning/periods/${periodId}/targets`, { targets }),
  bumpTargetCount: (targetId: string, delta: number) =>
    api.patch<PlanTarget>(`/planning/targets/${targetId}/count`, { delta }),

  // Zaman blokları
  listBlocks: (from: string, to: string) =>
    api.get<PlanTimeBlock[]>(`/planning/blocks?from=${from}&to=${to}`),
  createBlock: (body: PlanBlockInput) => api.post<PlanTimeBlock>("/planning/blocks", body),
  createBlocks: (blocks: PlanBlockInput[]) => api.post<PlanTimeBlock[]>("/planning/blocks/bulk", { blocks }),
  updateBlock: (id: string, body: PlanBlockInput) => api.patch<PlanTimeBlock>(`/planning/blocks/${id}`, body),
  /** Sürükle-bırak. endsAt verilmezse bloğun mevcut süresi korunur. */
  moveBlock: (id: string, body: { blockDate?: string; startsAt?: string; endsAt?: string }) =>
    api.patch<PlanTimeBlock>(`/planning/blocks/${id}/move`, body),
  setBlockStatus: (id: string, status: PlanBlockStatus, actualMinutes?: number) =>
    api.patch<PlanTimeBlock>(`/planning/blocks/${id}/status`, { status, actualMinutes }),
  deleteBlock: (id: string) => api.delete<{ ok: true }>(`/planning/blocks/${id}`),
  clearSuggestions: (from: string, to: string) =>
    api.delete<{ removed: number }>(`/planning/blocks/suggestions?from=${from}&to=${to}`),

  // Ritüeller
  getDueRitual: () => api.get<PlanRitualPrompt | undefined>("/planning/rituals/due"),
  listRituals: (kind?: string, limit = 12) =>
    api.get<PlanRitual[]>(`/planning/rituals?limit=${limit}${kind ? `&kind=${kind}` : ""}`),
  completeRitual: (body: {
    kind: string;
    occurredOn?: string;
    periodId?: string;
    answers?: Record<string, unknown>;
    summary?: string;
    status?: "done" | "skipped";
  }) => api.post<PlanRitual>("/planning/rituals", body),

  /** apply=false yalnızca önizler; takvim değişmez. */
  suggest: (body: { kind: PlanPeriodKind; date: string; apply?: boolean; replaceExisting?: boolean }) =>
    api.post<PlanSuggestionResult>("/planning/suggest", body),
};
