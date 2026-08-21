import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Project, Task, TaskStatus } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import TaskColumn from "../TaskColumn";
import TaskSelectionBar from "../TaskSelectionBar";
import TaskSortMenu from "../TaskSortMenu";
import MoveTaskModal from "../MoveTaskModal";
import ConfirmDialog from "../ConfirmDialog";
import { useTaskSelection } from "../../lib/useTaskSelection";
import { selectedLioTasks } from "../../lib/askLio";
import { sortTasks, type TaskSortMode } from "../../lib/taskSort";
import { useUndo } from "../../lib/undo";

type CreateOptions = { weekNumber?: number; deadline?: string; startDate?: string };
export type ViewMode = "project" | "day" | "week" | "month" | "year";

// Süreç sekmesinin gün/hafta/ay/yıl gezinme durumu — ProjectDetail'de tutulur ki
// sekmeler arası geçişte (ProcessPanel unmount olunca) seçim kaybolmasın.
export interface ProcessNavState {
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  selectedDay: Date;
  setSelectedDay: Dispatch<SetStateAction<Date>>;
  viewingDay: Date;
  setViewingDay: Dispatch<SetStateAction<Date>>;
  selectedWeek: number | null;
  setSelectedWeek: Dispatch<SetStateAction<number | null>>;
  viewingWeek: number;
  setViewingWeek: Dispatch<SetStateAction<number>>;
  selectedMonth: number | null;
  setSelectedMonth: Dispatch<SetStateAction<number | null>>;
  viewingMonth: number;
  setViewingMonth: Dispatch<SetStateAction<number>>;
  selectedYear: number | null;
  setSelectedYear: Dispatch<SetStateAction<number | null>>;
}

interface Props {
  project: Project;
  tasks: Task[];
  onCreateTask: (status: TaskStatus, title: string, options?: CreateOptions) => void;
  onCreateSubtask: (parentId: string, title: string) => void;
  onMoveTask: (taskId: string, status: TaskStatus) => void;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  // Başlığa çift tıklayarak yerinde ad değiştirme (bkz. TaskColumn.onTaskRenamed).
  onTaskRenamed?: (updated: Task) => void;
  nav: ProcessNavState;
  activeTaskId?: string;
  onToggleActive?: (taskId: string) => void;
  onTasksDuplicated?: (created: Task[]) => void;
  onTasksMoved?: (moved: Task[]) => void;
  onTasksArchived?: (ids: string[]) => void;
  onTasksDeleted?: (ids: string[]) => void;
}

export const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
export const WEEKS_PER_MONTH = 4;
const MONTHS_PER_YEAR = 12;
const WEEKS_PER_YEAR = WEEKS_PER_MONTH * MONTHS_PER_YEAR;
const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

export function dateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

// Proje yüklendiğinde gezinme durumunun makul (bugüne/bu haftaya/bu aya sabitlenmiş) varsayılanlarla
// başlaması için ProjectDetail tarafından bir kere çağrılır.
export function computeInitialProcessNavDates(project: Project) {
  const start = new Date(project.startDate).getTime();
  const end = new Date(project.deadline).getTime();
  const span = Math.max(end - start, 1);
  const totalWeeksInit = Math.max(1, Math.ceil(span / MS_PER_WEEK));
  const totalMonthsInit = Math.max(1, Math.ceil(totalWeeksInit / WEEKS_PER_MONTH));
  const wk = Math.min(totalWeeksInit, Math.max(1, Math.ceil((Date.now() - start + 1) / MS_PER_WEEK)));
  const mo = Math.min(totalMonthsInit, Math.max(1, Math.ceil(wk / WEEKS_PER_MONTH)));
  const yr = Math.max(1, Math.ceil(mo / MONTHS_PER_YEAR));
  const startDay = dateOnly(new Date(project.startDate));
  const endDay = dateOnly(new Date(project.deadline));
  const now = dateOnly(new Date());
  const clampedToday = now < startDay ? startDay : now > endDay ? endDay : now;
  return {
    viewingWeek: wk,
    selectedWeek: wk,
    viewingMonth: mo,
    selectedMonth: mo,
    selectedYear: yr,
    selectedDay: clampedToday,
    viewingDay: clampedToday,
  };
}

export default function ProcessPanel({
  project,
  tasks,
  onCreateTask,
  onCreateSubtask,
  onMoveTask,
  onToggleComplete,
  onEditTask,
  onTaskRenamed,
  nav,
  activeTaskId,
  onToggleActive,
  onTasksDuplicated,
  onTasksMoved,
  onTasksArchived,
  onTasksDeleted,
}: Props) {
  const c = useThemeColors();
  const selection = useTaskSelection();
  const { pushUndo, pushDestructive } = useUndo();
  const [sort, setSort] = useState<TaskSortMode>("manual");
  const [duplicating, setDuplicating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmingBulkAction, setConfirmingBulkAction] = useState<"archive" | "delete" | null>(null);
  const [movingOpen, setMovingOpen] = useState(false);

  const handleDuplicateSelected = async () => {
    if (selection.selectedIds.size === 0) return;
    setDuplicating(true);
    try {
      const created = await api.post<Task[]>("/tasks/duplicate", { ids: Array.from(selection.selectedIds) });
      onTasksDuplicated?.(created);
      selection.clear();
    } catch {
      // çoğaltılamadı, kullanıcı tekrar deneyebilir
    } finally {
      setDuplicating(false);
    }
  };

  // Seçili görevleri (ve üst seviye olanlarınsa alt görevlerini) toplu arşivler.
  // Onay modalının (ConfirmDialog) onConfirm'ü olarak kullanılır — hata fırlatırsa
  // modal açık kalıp hata mesajı gösterir, o yüzden burada hatayı yutmuyoruz.
  const handleArchiveSelected = async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0) return;
    setArchiving(true);
    try {
      await api.patch<Task[]>("/tasks/bulk-archive", { ids });
      onTasksArchived?.(ids);
      // Arşivleme geri alınabilir: her görev zaten tekil /restore uç noktasına
      // sahip ve o uç nokta alt görevleri de kendiliğinden geri getiriyor.
      pushUndo({
        label: `${ids.length} görev arşivleme`,
        run: async () => {
          await Promise.all(ids.map((id) => api.patch(`/tasks/${id}/restore`, {})));
        },
        redo: async () => {
          await api.patch("/tasks/bulk-archive", { ids });
        },
      });
      selection.clear();
      setConfirmingBulkAction(null);
    } finally {
      setArchiving(false);
    }
  };

  // Seçili görevleri (ve alt görevlerini) toplu siler. Kalıcı silme sunucuda
  // geri alınamadığı için hemen yapılmaz: arayüzden hemen kaldırılır ama gerçek
  // istek birkaç saniye ertelenir (bkz. lib/undo pushDestructive) — tekil görev
  // silmede olduğu gibi bu pencerede Cmd/Ctrl+Z ile iptal edilebilir.
  const handleDeleteSelected = () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0) return;
    onTasksDeleted?.(ids);
    pushDestructive({
      label: `${ids.length} görev silme`,
      commit: () => api.post("/tasks/bulk-delete", { ids }),
      restore: () => {},
      entityIds: ids,
    });
    selection.clear();
    setConfirmingBulkAction(null);
  };
  const {
    viewMode,
    setViewMode,
    selectedDay,
    setSelectedDay,
    viewingDay,
    setViewingDay,
    selectedWeek,
    setSelectedWeek,
    viewingWeek,
    setViewingWeek,
    selectedMonth,
    setSelectedMonth,
    viewingMonth,
    setViewingMonth,
    selectedYear,
    setSelectedYear,
  } = nav;

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "completed").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const today = new Date();

  const topLevel = tasks.filter((t) => !t.parentTaskId);
  const rangeStart = new Date(project.startDate).getTime();
  const rangeEnd = new Date(project.deadline).getTime();
  const rangeSpan = Math.max(rangeEnd - rangeStart, 1);

  const totalWeeks = Math.max(1, Math.ceil(rangeSpan / MS_PER_WEEK));
  const totalMonths = Math.max(1, Math.ceil(totalWeeks / WEEKS_PER_MONTH));
  const totalYears = Math.max(1, Math.ceil(totalWeeks / WEEKS_PER_YEAR));
  const showYearOption = totalWeeks > WEEKS_PER_YEAR;

  const weekRange = (weekNumber: number) => {
    const start = new Date(rangeStart + (weekNumber - 1) * MS_PER_WEEK);
    const end = new Date(Math.min(rangeStart + weekNumber * MS_PER_WEEK, rangeEnd));
    return { start, end };
  };

  const monthWeekSpan = (monthNumber: number) => {
    const startWeek = (monthNumber - 1) * WEEKS_PER_MONTH + 1;
    const endWeek = Math.min(monthNumber * WEEKS_PER_MONTH, totalWeeks);
    return { startWeek, endWeek };
  };

  const monthRange = (monthNumber: number) => {
    const { startWeek, endWeek } = monthWeekSpan(monthNumber);
    return { start: weekRange(startWeek).start, end: weekRange(endWeek).end };
  };

  const yearWeekSpan = (yearNumber: number) => {
    const startWeek = (yearNumber - 1) * WEEKS_PER_YEAR + 1;
    const endWeek = Math.min(yearNumber * WEEKS_PER_YEAR, totalWeeks);
    return { startWeek, endWeek };
  };

  const yearRange = (yearNumber: number) => {
    const { startWeek, endWeek } = yearWeekSpan(yearNumber);
    return { start: weekRange(startWeek).start, end: weekRange(endWeek).end };
  };

  // Bir görevin (veya alt görevse üst görevinin) belirli bir hafta aralığına düşüp düşmediği.
  // Göreve elle bir hafta atanmışsa ona göre, atanmamışsa gerçek tarihine (başlangıç-bitiş) göre eşleşir —
  // böylece daha önce haftaya etiketlenmemiş görevler de kendi haftasında görünür.
  const taskInWeekRange = (t: Task, startWeek: number, endWeek: number): boolean => {
    const subject = t.parentTaskId ? tasks.find((p) => p.id === t.parentTaskId) ?? t : t;
    if (subject.weekNumber != null) {
      return subject.weekNumber >= startWeek && subject.weekNumber <= endWeek;
    }
    const rangeStartDate = weekRange(startWeek).start;
    const rangeEndDate = weekRange(endWeek).end;
    const start = dateOnly(new Date(subject.startDate ?? subject.createdAt));
    const end = dateOnly(new Date(subject.deadline));
    return start <= rangeEndDate && end >= rangeStartDate;
  };

  const taskIsOnDay = (t: Task, day: Date): boolean => {
    const subject = t.parentTaskId ? tasks.find((p) => p.id === t.parentTaskId) ?? t : t;
    const start = dateOnly(new Date(subject.startDate ?? subject.createdAt));
    const end = dateOnly(new Date(subject.deadline));
    return start <= day && day <= end;
  };

  const projectStartDay = dateOnly(new Date(project.startDate));
  const projectEndDay = dateOnly(new Date(project.deadline));
  const isWithinProject = (d: Date) => d.getTime() >= projectStartDay.getTime() && d.getTime() <= projectEndDay.getTime();
  const canGoPrevDay = viewingDay.getTime() > projectStartDay.getTime();
  const canGoNextDay = viewingDay.getTime() < projectEndDay.getTime();
  const goPrevDay = () => canGoPrevDay && setViewingDay((d) => addDays(d, -1));
  const goNextDay = () => canGoNextDay && setViewingDay((d) => addDays(d, 1));
  const pickDay = (d: Date) => {
    setSelectedDay(d);
    setViewingDay(d);
  };

  // Bugün balonu her zaman erişilebilir kalsın: ileri gidildiğinde sol balon, geri gidildiğinde sağ balon "bugün"e sabitlenir.
  const todayOnly = dateOnly(today);
  const leftDay = viewingDay.getTime() > todayOnly.getTime() ? todayOnly : addDays(viewingDay, -1);
  const rightDay = viewingDay.getTime() < todayOnly.getTime() ? todayOnly : addDays(viewingDay, 1);
  const dayBubbles = [leftDay, viewingDay, rightDay];

  const weekNumberForDate = (d: Date) =>
    Math.min(totalWeeks, Math.max(1, Math.ceil((d.getTime() - rangeStart + 1) / MS_PER_WEEK)));

  const dayLabel = (d: Date) =>
    isSameDate(d, today) ? "Bugün" : d.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" });

  // Balon renk durumu: seçili (dolu primary) / güncel ama seçili değil (hafif accent vurgu) / normal / aralık dışı
  const bubbleStyle = (active: boolean, isCurrent: boolean, inRange: boolean) => {
    if (active) return { border: c.primary, background: c.primary, color: "#fff", fontWeight: 600 };
    if (isCurrent && inRange) return { border: c.accent, background: `${c.accent}1f`, color: c.accentDark, fontWeight: 600 };
    if (!inRange) return { border: c.border, background: c.background, color: c.textSecondary, fontWeight: 500 };
    return { border: c.border, background: c.background, color: c.textPrimary, fontWeight: 500 };
  };

  // Hafta gezinme: proje 1 yıldan uzun olunca balon listesi yerine gün seçeneğindeki gibi ok tabanlı gezinme kullanılır.
  const currentWeekNum = weekNumberForDate(today);
  const canGoPrevWeek = viewingWeek > 1;
  const canGoNextWeek = viewingWeek < totalWeeks;
  const goPrevWeek = () => canGoPrevWeek && setViewingWeek((w) => w - 1);
  const goNextWeek = () => canGoNextWeek && setViewingWeek((w) => w + 1);
  const pickWeek = (w: number) => {
    setSelectedWeek(w);
    setViewingWeek(w);
  };
  // Bu hafta balonu her zaman erişilebilir kalsın: ileri gidildiğinde sol balon, geri gidildiğinde sağ balon "bu hafta"ya sabitlenir.
  const leftWeek = viewingWeek > currentWeekNum ? currentWeekNum : viewingWeek - 1;
  const rightWeek = viewingWeek < currentWeekNum ? currentWeekNum : viewingWeek + 1;
  const weekBubbles = [leftWeek, viewingWeek, rightWeek];
  const weekIsInRange = (w: number) => w >= 1 && w <= totalWeeks;
  const weekBubbleLabel = (w: number) => (w === currentWeekNum ? `Bu hafta · ${w}. hafta` : `${w}. hafta`);

  // Ay gezinme: gün ve hafta seçeneklerindeki ile aynı ok tabanlı gezinme.
  const monthNumberForDate = (d: Date) => Math.min(totalMonths, Math.max(1, Math.ceil(weekNumberForDate(d) / WEEKS_PER_MONTH)));
  const currentMonthNum = monthNumberForDate(today);
  const canGoPrevMonth = viewingMonth > 1;
  const canGoNextMonth = viewingMonth < totalMonths;
  const goPrevMonth = () => canGoPrevMonth && setViewingMonth((m) => m - 1);
  const goNextMonth = () => canGoNextMonth && setViewingMonth((m) => m + 1);
  const pickMonth = (m: number) => {
    setSelectedMonth(m);
    setViewingMonth(m);
  };
  const leftMonth = viewingMonth > currentMonthNum ? currentMonthNum : viewingMonth - 1;
  const rightMonth = viewingMonth < currentMonthNum ? currentMonthNum : viewingMonth + 1;
  const monthBubbles = [leftMonth, viewingMonth, rightMonth];
  const monthIsInRange = (m: number) => m >= 1 && m <= totalMonths;
  const monthBubbleLabel = (m: number) => (m === currentMonthNum ? `Bu ay · Ay ${m}` : `Ay ${m}`);

  let filteredTasks: Task[] = [];
  let createOptions: CreateOptions = {};
  let showKanban = false;

  if (viewMode === "project") {
    filteredTasks = tasks;
    createOptions = {};
    showKanban = true;
  } else if (viewMode === "day") {
    filteredTasks = tasks.filter((t) => taskIsOnDay(t, selectedDay));
    const dayIso = selectedDay.toISOString();
    createOptions = { deadline: dayIso, startDate: dayIso, weekNumber: weekNumberForDate(selectedDay) };
    showKanban = true;
  } else if (viewMode === "week" && selectedWeek != null) {
    filteredTasks = tasks.filter((t) => taskInWeekRange(t, selectedWeek, selectedWeek));
    createOptions = { weekNumber: selectedWeek };
    showKanban = true;
  } else if (viewMode === "month" && selectedMonth != null) {
    const { startWeek, endWeek } = monthWeekSpan(selectedMonth);
    filteredTasks = tasks.filter((t) => taskInWeekRange(t, startWeek, endWeek));
    createOptions = { weekNumber: startWeek };
    showKanban = true;
  } else if (viewMode === "year" && selectedYear != null) {
    const { startWeek, endWeek } = yearWeekSpan(selectedYear);
    filteredTasks = tasks.filter((t) => taskInWeekRange(t, startWeek, endWeek));
    createOptions = { weekNumber: startWeek };
    showKanban = true;
  }

  // Süreç içindeki kanban görünümlerinde kolonlar, o an gösterilen görev sayısına göre (en yoğun üstte) sıralanır.
  const sortedColumns = [...columns].sort((a, b) => {
    const countFor = (status: TaskStatus) => filteredTasks.filter((t) => t.status === status && !t.parentTaskId).length;
    return countFor(b) - countFor(a);
  });

  const modeButtons: { key: ViewMode; label: string }[] = [
    { key: "project", label: "Proje" },
    { key: "day", label: "Gün" },
    { key: "week", label: "Hafta" },
    { key: "month", label: "Ay" },
    ...(showYearOption ? [{ key: "year" as ViewMode, label: "Yıl" }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: c.textSecondary, flexShrink: 0 }}>
            {new Date(project.startDate).toLocaleDateString("tr-TR")}
          </span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: c.border, overflow: "hidden", position: "relative" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: c.accent, borderRadius: 4, transition: "width 0.15s ease" }} />
          </div>
          <span style={{ fontSize: 13, color: c.textSecondary, flexShrink: 0 }}>
            {new Date(project.deadline).toLocaleDateString("tr-TR")}
          </span>
        </div>
        <p style={{ textAlign: "center", fontSize: 15, color: c.textPrimary, margin: "10px 0 0" }}>
          Görevlerin %{pct}'si tamamlandı ({done}/{total})
        </p>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
          <div style={{ display: "flex", gap: 4, background: c.background, border: `1px solid ${c.border}`, borderRadius: 8, padding: 3, marginBottom: 10, width: "fit-content", marginLeft: "auto" }}>
            {modeButtons.map((m) => (
              <button
                key={m.key}
                onClick={() => setViewMode(m.key)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: viewMode === m.key ? c.primary : "transparent",
                  color: viewMode === m.key ? "#fff" : c.textSecondary,
                  fontSize: 15,
                  fontWeight: 500,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {viewMode === "day" && (
            <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", width: "100%", gap: 8 }}>
              <button
                onClick={goPrevDay}
                disabled={!canGoPrevDay}
                aria-label="Önceki gün"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${c.border}`,
                  background: c.background,
                  color: canGoPrevDay ? c.textPrimary : c.textSecondary,
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                ‹
              </button>

              <div style={{ flex: 1, display: "flex", flexWrap: "nowrap", justifyContent: "space-between", alignItems: "center", gap: 6, minWidth: 0 }}>
                {dayBubbles.map((d, i) => {
                  const inRange = isWithinProject(d);
                  const active = isSameDate(d, selectedDay);
                  const isCurrent = isSameDate(d, today);
                  const label = isCurrent ? `Bugün · ${d.toLocaleDateString("tr-TR")}` : dayLabel(d);
                  const s = bubbleStyle(active, isCurrent, inRange);
                  return (
                    <button
                      key={i}
                      onClick={() => inRange && pickDay(d)}
                      disabled={!inRange}
                      style={{
                        flex: "1 1 0",
                        minWidth: 0,
                        maxWidth: 132,
                        padding: "6px 8px",
                        borderRadius: 20,
                        border: `1px solid ${s.border}`,
                        background: s.background,
                        color: s.color,
                        fontSize: 15,
                        fontWeight: s.fontWeight,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={goNextDay}
                disabled={!canGoNextDay}
                aria-label="Sonraki gün"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${c.border}`,
                  background: c.background,
                  color: canGoNextDay ? c.textPrimary : c.textSecondary,
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                ›
              </button>
            </div>
          )}

          {viewMode === "week" && (
            <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", width: "100%", gap: 8 }}>
              <button
                onClick={goPrevWeek}
                disabled={!canGoPrevWeek}
                aria-label="Önceki hafta"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${c.border}`,
                  background: c.background,
                  color: canGoPrevWeek ? c.textPrimary : c.textSecondary,
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                ‹
              </button>

              <div style={{ flex: 1, display: "flex", flexWrap: "nowrap", justifyContent: "space-between", alignItems: "center", gap: 6, minWidth: 0 }}>
                {weekBubbles.map((w, i) => {
                  const inRange = weekIsInRange(w);
                  const active = selectedWeek === w;
                  const isCurrent = w === currentWeekNum;
                  const s = bubbleStyle(active, isCurrent, inRange);
                  return (
                    <button
                      key={i}
                      onClick={() => inRange && pickWeek(w)}
                      disabled={!inRange}
                      style={{
                        flex: "1 1 0",
                        minWidth: 0,
                        maxWidth: 132,
                        padding: "6px 8px",
                        borderRadius: 20,
                        border: `1px solid ${s.border}`,
                        background: s.background,
                        color: s.color,
                        fontSize: 15,
                        fontWeight: s.fontWeight,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {inRange ? weekBubbleLabel(w) : `${w}. hafta`}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={goNextWeek}
                disabled={!canGoNextWeek}
                aria-label="Sonraki hafta"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${c.border}`,
                  background: c.background,
                  color: canGoNextWeek ? c.textPrimary : c.textSecondary,
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                ›
              </button>
            </div>
          )}

          {viewMode === "month" && (
            <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", width: "100%", gap: 8 }}>
              <button
                onClick={goPrevMonth}
                disabled={!canGoPrevMonth}
                aria-label="Önceki ay"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${c.border}`,
                  background: c.background,
                  color: canGoPrevMonth ? c.textPrimary : c.textSecondary,
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                ‹
              </button>

              <div style={{ flex: 1, display: "flex", flexWrap: "nowrap", justifyContent: "space-between", alignItems: "center", gap: 6, minWidth: 0 }}>
                {monthBubbles.map((m, i) => {
                  const inRange = monthIsInRange(m);
                  const active = selectedMonth === m;
                  const isCurrent = m === currentMonthNum;
                  const s = bubbleStyle(active, isCurrent, inRange);
                  return (
                    <button
                      key={i}
                      onClick={() => inRange && pickMonth(m)}
                      disabled={!inRange}
                      style={{
                        flex: "1 1 0",
                        minWidth: 0,
                        maxWidth: 132,
                        padding: "6px 8px",
                        borderRadius: 20,
                        border: `1px solid ${s.border}`,
                        background: s.background,
                        color: s.color,
                        fontSize: 15,
                        fontWeight: s.fontWeight,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {inRange ? monthBubbleLabel(m) : `Ay ${m}`}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={goNextMonth}
                disabled={!canGoNextMonth}
                aria-label="Sonraki ay"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${c.border}`,
                  background: c.background,
                  color: canGoNextMonth ? c.textPrimary : c.textSecondary,
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                ›
              </button>
            </div>
          )}

          {viewMode === "year" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Array.from({ length: totalYears }, (_, i) => i + 1).map((y) => {
                const active = selectedYear === y;
                const { startWeek, endWeek } = yearWeekSpan(y);
                const count = topLevel.filter((t) => t.weekNumber != null && t.weekNumber >= startWeek && t.weekNumber <= endWeek).length;
                return (
                  <button
                    key={y}
                    onClick={() => setSelectedYear(active ? null : y)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "6px 12px",
                      borderRadius: 20,
                      border: `1px solid ${active ? c.primary : c.border}`,
                      background: active ? c.primary : c.background,
                      color: active ? "#fff" : c.textPrimary,
                      fontSize: 15,
                      fontWeight: 500,
                    }}
                  >
                    {y}. yıl
                    {count > 0 && (
                      <span
                        style={{
                          fontSize: 12,
                          color: active ? "#fff" : c.textSecondary,
                          background: active ? "rgba(255,255,255,0.25)" : c.surface,
                          borderRadius: 20,
                          padding: "0 6px",
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showKanban && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <h4 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: 0 }}>
              {viewMode === "project" && project.title}
              {viewMode === "day" && `${dayLabel(selectedDay)} · ${selectedDay.toLocaleDateString("tr-TR")}`}
              {viewMode === "week" && selectedWeek != null && `${selectedWeek}. hafta`}
              {viewMode === "month" && selectedMonth != null && `Ay ${selectedMonth}`}
              {viewMode === "year" && selectedYear != null && `${selectedYear}. yıl`}
            </h4>
            {viewMode === "project" && (
              <span style={{ fontSize: 13, color: c.textSecondary }}>
                {new Date(project.startDate).toLocaleDateString("tr-TR")} – {new Date(project.deadline).toLocaleDateString("tr-TR")}
              </span>
            )}
            {viewMode === "week" && selectedWeek != null && (
              <span style={{ fontSize: 13, color: c.textSecondary }}>
                {weekRange(selectedWeek).start.toLocaleDateString("tr-TR")} – {weekRange(selectedWeek).end.toLocaleDateString("tr-TR")}
              </span>
            )}
            {viewMode === "month" && selectedMonth != null && (
              <span style={{ fontSize: 13, color: c.textSecondary }}>
                {monthRange(selectedMonth).start.toLocaleDateString("tr-TR")} – {monthRange(selectedMonth).end.toLocaleDateString("tr-TR")}
              </span>
            )}
            {viewMode === "year" && selectedYear != null && (
              <span style={{ fontSize: 13, color: c.textSecondary }}>
                {yearRange(selectedYear).start.toLocaleDateString("tr-TR")} – {yearRange(selectedYear).end.toLocaleDateString("tr-TR")}
              </span>
            )}
          </div>


          {/* Tek satırlık araç çubuğu: sağda sıralama ve seçim. Seçim modu
              açıldığında bar tam genişlik alıp alta kayar. */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div style={{ marginLeft: "auto" }}>
              <TaskSortMenu value={sort} onChange={setSort} />
            </div>
            <TaskSelectionBar
              inline
              selectionMode={selection.selectionMode}
              selectedCount={selection.selectedIds.size}
              busy={duplicating || archiving}
              onEnable={selection.toggleSelectionMode}
              onCancel={selection.clear}
              onDuplicate={handleDuplicateSelected}
              onMove={() => setMovingOpen(true)}
              onArchive={() => setConfirmingBulkAction("archive")}
              onDelete={() => setConfirmingBulkAction("delete")}
              lioTasks={selectedLioTasks(tasks, selection.selectedIds)}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {sortedColumns.map((status) => (
              <TaskColumn
                key={status}
                status={status}
                allTasks={sortTasks(filteredTasks, sort)}
                onCreate={(s, title) => onCreateTask(s, title, createOptions)}
                onCreateSubtask={onCreateSubtask}
                onMove={onMoveTask}
                onToggleComplete={onToggleComplete}
                onEditTask={onEditTask}
                onTaskRenamed={onTaskRenamed}
                group={`tasks-process-${project.id}`}
                activeTaskId={activeTaskId}
                onToggleActive={onToggleActive}
                selectionMode={selection.selectionMode}
                selectedIds={selection.selectedIds}
                onToggleSelect={selection.toggleSelect}
              />
            ))}
          </div>

          {movingOpen && (
            <MoveTaskModal
              taskIds={Array.from(selection.selectedIds)}
              onClose={() => setMovingOpen(false)}
              onMoved={(moved) => {
                onTasksMoved?.(moved);
                selection.clear();
              }}
            />
          )}
          {confirmingBulkAction === "archive" && (
            <ConfirmDialog
              title="Görevleri arşivle"
              message={`${selection.selectedIds.size} görevi (varsa alt görevleriyle birlikte) arşive taşımak istediğine emin misin? Arşivlenen görevler bu listeden kalkar, arşivden geri getirilebilir.`}
              confirmLabel="Arşivle"
              danger={false}
              onCancel={() => setConfirmingBulkAction(null)}
              onConfirm={handleArchiveSelected}
            />
          )}
          {confirmingBulkAction === "delete" && (
            <ConfirmDialog
              title="Görevleri sil"
              message={`${selection.selectedIds.size} görevi (varsa alt görevleriyle birlikte) silmek istediğine emin misin? Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.`}
              confirmLabel="Sil"
              danger
              onCancel={() => setConfirmingBulkAction(null)}
              onConfirm={handleDeleteSelected}
            />
          )}
        </div>
      )}

    </div>
  );
}
