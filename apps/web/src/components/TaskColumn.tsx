import { useEffect, useRef, useState } from "react";
import Sortable from "sortablejs";
import type { Task, TaskStatus } from "@projelio/shared";
import { colors } from "../theme/colors";
import { IconPlus, IconChevronRight, IconCheck, IconEdit, IconActivity } from "./icons";
import Modal from "./Modal";
import { useSortableList } from "../lib/useSortableList";

interface Props {
  status: TaskStatus;
  allTasks: Task[];
  // Verilmezse (ör. birden fazla projeyi birleştiren iş-geneli görünümde) sütunun altındaki
  // hızlı "Görev ekle" satırı gizlenir, çünkü hangi projeye/çıktıya ekleneceği belli olmaz.
  onCreate?: (status: TaskStatus, title: string) => void;
  onCreateSubtask: (parentId: string, title: string) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  // Aynı sütun içinde ya da sütunlar arasında (durum değişikliğiyle) basılı-tutup-sürükleme
  // ile sıralama yapıldığında son sırayı kalıcı hale getirmek için çağrılır.
  onReorderTasks?: (ids: string[]) => void;
  // Sütunlar arası sürüklemenin çalışabilmesi için aynı görünümdeki tüm TaskColumn
  // örnekleri aynı group değerini paylaşmalı.
  group: string;
  // Giriş yapmış kullanıcının "üzerinde çalışıyorum" diyerek işaretlediği görev (varsa).
  activeTaskId?: string;
  onToggleActive?: (taskId: string) => void;
  // Verilirse (ör. birden fazla projeyi birleştiren iş-geneli görünümde) her görevin altında
  // hangi proje/çıktıya ait olduğunu gösteren küçük bir alt yazı render edilir.
  getTaskMeta?: (task: Task) => string | undefined;
  // Verilirse (ör. iş ekibi sekmesinden bir göreve tıklanıp buraya yönlendirildiğinde),
  // eşleşen görev/alt görev otomatik görünüre kaydırılır ve kısa süreliğine parlayarak
  // fark edilir hale getirilir.
  highlightTaskId?: string;
}

const columnLabel: Record<TaskStatus, string> = {
  todo: "Yapılacak",
  in_progress: "Devam eden",
  completed: "Tamamlandı",
};

export default function TaskColumn({
  status,
  allTasks,
  onCreate,
  onCreateSubtask,
  onMove,
  onToggleComplete,
  onEditTask,
  onReorderTasks,
  group,
  activeTaskId,
  onToggleActive,
  getTaskMeta,
  highlightTaskId,
}: Props) {
  const c = colors.light;
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subtaskParent, setSubtaskParent] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; title: string } | null>(null);
  const topListRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Hedef görev bir alt görevse, önce ait olduğu üst görevin açılır listesini genişlet
  // ki DOM'da render olsun ve kaydırma/parlama animasyonu ona ulaşabilsin.
  useEffect(() => {
    if (!highlightTaskId) return;
    const target = allTasks.find((t) => t.id === highlightTaskId);
    if (target?.parentTaskId) {
      setExpanded((prev) => (prev.has(target.parentTaskId!) ? prev : new Set(prev).add(target.parentTaskId!)));
    }
  }, [highlightTaskId, allTasks]);

  // Hedef görev DOM'da render olduğunda (gerekirse üst görev açıldıktan sonra) görünüre kaydır.
  useEffect(() => {
    if (!highlightTaskId) return;
    const el = rootRef.current?.querySelector(`[data-id="${highlightTaskId}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightTaskId, expanded]);
  const subtaskSortables = useRef<Map<string, Sortable>>(new Map());

  const isCompletedColumn = status === "completed";

  const columnAccent: Record<TaskStatus, string> = {
    todo: c.textSecondary,
    in_progress: c.primary,
    completed: c.success,
  };

  // Bu kolonda gerçekten yaşayan üst görevler (kendi statüsü bu kolonla eşleşen).
  const realTopLevel = allTasks.filter((t) => t.status === status && !t.parentTaskId);

  // Bir üst görevin altında gösterilecek alt görevler.
  // Tamamlandı kolonunda üst görev zaten tamamlanmışsa tüm alt görevleri (durumu ne olursa olsun) gösteriyoruz.
  // Diğer kolonlarda tamamlanmış alt görevler buradan kalkıp Tamamlandı'daki hayalet gruba taşınıyor.
  const subtasksOf = (parentId: string) =>
    allTasks.filter((t) => t.parentTaskId === parentId && (isCompletedColumn || t.status !== "completed"));

  // Rozet için: toplam alt görev ve henüz tamamlanmamış (kalan) alt görev sayısı.
  const subtaskStats = (parentId: string) => {
    const all = allTasks.filter((t) => t.parentTaskId === parentId);
    const remaining = all.filter((t) => t.status !== "completed").length;
    return { total: all.length, remaining };
  };

  // Sadece Tamamlandı kolonunda: üst görevi henüz tamamlanmamış ama kendisi tamamlanmış alt görevler.
  // Bunlar üst görevin hayalet (düşük opasiteli) bir başlığı altında gruplanır.
  const ghostGroups: { parent: Task; subtasks: Task[] }[] = [];
  if (isCompletedColumn) {
    const byParent = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (!t.parentTaskId || t.status !== "completed") continue;
      const parent = allTasks.find((p) => p.id === t.parentTaskId);
      if (!parent || parent.status === "completed") continue;
      if (!byParent.has(parent.id)) byParent.set(parent.id, []);
      byParent.get(parent.id)!.push(t);
    }
    for (const [parentId, subs] of byParent) {
      const parent = allTasks.find((p) => p.id === parentId)!;
      ghostGroups.push({ parent, subtasks: subs });
    }
  }

  // Üst görev kartları: kendi sütununda basılı tutup sürükleyerek sıralanabilir,
  // başka bir sütuna bırakıldığında ise görevin durumu değişir.
  useSortableList(
    topListRef,
    {
      group: { name: group, pull: true, put: true },
      sort: Boolean(onReorderTasks),
      handle: ".task-drag-handle",
      filter: "button",
      preventOnFilter: false,
      onEnd: (evt) => {
        const toEl = evt.to;
        const fromEl = evt.from;
        const taskId = evt.item.dataset.id;
        if (!taskId) return;
        if (toEl !== fromEl) {
          const toStatus = toEl.dataset.status as TaskStatus | undefined;
          if (toStatus) onMove(taskId, toStatus);
        }
        if (!onReorderTasks) return;
        const ids = Array.from(toEl.children)
          .map((node) => (node as HTMLElement).dataset.id)
          .filter((v): v is string => Boolean(v));
        onReorderTasks(ids);
      },
    },
    [group, Boolean(onReorderTasks)]
  );

  const attachSubtaskSortable = (parentId: string) => (el: HTMLDivElement | null) => {
    const existing = subtaskSortables.current.get(parentId);
    if (existing) {
      existing.destroy();
      subtaskSortables.current.delete(parentId);
    }
    if (!el || !onReorderTasks) return;
    const instance = Sortable.create(el, {
      animation: 180,
      delay: 350,
      delayOnTouchOnly: false,
      touchStartThreshold: 5,
      forceFallback: true,
      fallbackTolerance: 3,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      filter: "button",
      preventOnFilter: false,
      onEnd: () => {
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id)
          .filter((v): v is string => Boolean(v));
        onReorderTasks(ids);
      },
    });
    subtaskSortables.current.set(parentId, instance);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mobil klavyelerin "bitti/onay" tuşu her zaman gerçek bir Enter tuşu göndermeyip
  // sadece input'un odağını kaybettirebiliyor (blur). Bu yüzden ekleme mantığı hem
  // form submit hem de blur'dan çağrılabilen tek bir fonksiyonda toplanıyor; aynı anda
  // ikisi birden tetiklense bile addingRef sayesinde görev iki kez eklenmiyor.
  const addingTaskRef = useRef(false);
  const addingSubtaskRef = useRef(false);

  const commitAddTask = () => {
    if (addingTaskRef.current || !onCreate) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    addingTaskRef.current = true;
    onCreate(status, trimmed);
    setTitle("");
    setTimeout(() => {
      addingTaskRef.current = false;
    }, 0);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    commitAddTask();
  };

  const commitAddSubtask = (parentId: string) => {
    if (addingSubtaskRef.current) return;
    const trimmed = subtaskTitle.trim();
    if (!trimmed) {
      setSubtaskParent(null);
      return;
    }
    addingSubtaskRef.current = true;
    onCreateSubtask(parentId, trimmed);
    setSubtaskTitle("");
    setTimeout(() => {
      addingSubtaskRef.current = false;
    }, 0);
  };

  const handleAddSubtask = (e: React.FormEvent, parentId: string) => {
    e.preventDefault();
    commitAddSubtask(parentId);
  };

  const handleCheckboxClick = (e: React.MouseEvent, taskId: string, currentStatus: TaskStatus, taskTitle: string) => {
    e.stopPropagation();
    if (currentStatus === "completed") {
      onToggleComplete(taskId);
    } else {
      setConfirmTarget({ id: taskId, title: taskTitle });
    }
  };

  const confirmComplete = () => {
    if (confirmTarget) onToggleComplete(confirmTarget.id);
    setConfirmTarget(null);
  };

  return (
    <div
      ref={rootRef}
      style={{
        width: "100%",
        background: c.background,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h4 style={{ color: c.textPrimary, fontSize: 16, fontWeight: 500, margin: 0 }}>{columnLabel[status]}</h4>
        <span style={{ fontSize: 13, color: c.textSecondary, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 20, padding: "1px 7px" }}>
          {realTopLevel.length}
        </span>
      </div>

      <div ref={topListRef} data-status={status}>
        {realTopLevel.map((t) => {
          const subtasks = subtasksOf(t.id);
          const isOpen = expanded.has(t.id);
          const stats = subtaskStats(t.id);
          const isOverdue = t.status !== "completed" && new Date(t.deadline) < new Date();
          const isOverdueWithPendingSubtasks = isOverdue && stats.total > 0 && stats.remaining > 0;
          return (
            <div key={t.id} data-id={t.id} style={{ marginBottom: 8 }}>
              <div
                className={`task-drag-handle${highlightTaskId === t.id ? " task-highlight-flash" : ""}`}
                onClick={() => toggleExpand(t.id)}
                style={{
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderLeft: `3px solid ${columnAccent[status]}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={(e) => handleCheckboxClick(e, t.id, t.status, t.title)}
                    aria-label={t.status === "completed" ? "Tamamlandıyı geri al" : "Tamamlandı olarak işaretle"}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      flexShrink: 0,
                      border: t.status === "completed" ? "none" : `1.5px solid ${c.border}`,
                      background: t.status === "completed" ? c.accent : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    {t.status === "completed" && <IconCheck size={10} color="#fff" />}
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 16,
                        color: t.status === "completed" ? c.textSecondary : isOverdueWithPendingSubtasks ? c.danger : c.textPrimary,
                        textDecoration: t.status === "completed" ? "line-through" : "none",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                      }}
                    >
                      {t.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditTask(t);
                      }}
                      aria-label="Görevi düzenle"
                      style={{ background: "transparent", border: "none", padding: 2, display: "flex", flexShrink: 0 }}
                    >
                      <IconEdit size={13} color={c.textSecondary} />
                    </button>
                    {onToggleActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleActive(t.id);
                        }}
                        aria-label={activeTaskId === t.id ? "Üzerinde çalışmayı bırak" : "Üzerinde çalışıyorum"}
                        title={activeTaskId === t.id ? "Üzerinde çalışmayı bırak" : "Üzerinde çalışıyorum"}
                        className={activeTaskId === t.id ? "active-task-pulse" : undefined}
                        style={{
                          background: activeTaskId === t.id ? `${c.accent}22` : "transparent",
                          border: "none",
                          borderRadius: "50%",
                          padding: 3,
                          display: "flex",
                          flexShrink: 0,
                        }}
                      >
                        <IconActivity size={13} color={activeTaskId === t.id ? c.accentDark : c.textSecondary} filled={activeTaskId === t.id} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        transform: isOpen ? "rotate(90deg)" : "none",
                        transition: "transform 0.1s ease",
                      }}
                    >
                      <IconChevronRight size={13} color={c.textSecondary} />
                    </span>
                    {subtaskStats(t.id).total > 0 && (
                      <span
                        style={{
                          fontSize: 12,
                          lineHeight: 1,
                          color: c.textSecondary,
                          background: c.background,
                          border: `1px solid ${c.border}`,
                          borderRadius: 20,
                          minWidth: 14,
                          height: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 3px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {subtaskStats(t.id).remaining}/{subtaskStats(t.id).total}
                      </span>
                    )}
                  </div>
                </div>
                {getTaskMeta?.(t) && (
                  <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 3, overflowWrap: "break-word", wordBreak: "break-word" }}>
                    {getTaskMeta(t)}
                  </div>
                )}
                {(() => {
                  const { total, remaining } = subtaskStats(t.id);
                  const progressPct = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
                  const start = t.startDate ?? t.createdAt;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>
                        {new Date(start).toLocaleDateString("tr-TR")}
                      </span>
                      <div style={{ flex: 1, height: 5, borderRadius: 3, background: c.border, overflow: "hidden", minWidth: 24 }}>
                        <div
                          style={{
                            width: `${progressPct}%`,
                            height: "100%",
                            background: c.accent,
                            borderRadius: 3,
                            transition: "width 0.15s ease",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>
                        {new Date(t.deadline).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {isOpen && (
                <div
                  style={{
                    marginLeft: 14,
                    marginTop: 6,
                    paddingLeft: 12,
                    borderLeft: `2px solid ${c.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div ref={attachSubtaskSortable(t.id)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {subtasks.map((sub) => (
                      <div
                        key={sub.id}
                        data-id={sub.id}
                        className={highlightTaskId === sub.id ? "task-highlight-flash" : undefined}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          background: c.surface,
                          border: `1px solid ${c.border}`,
                          borderRadius: 7,
                          padding: "6px 9px",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleComplete(sub.id);
                          }}
                          aria-label={sub.status === "completed" ? "Alt görev tamamlandıyı geri al" : "Alt görevi tamamlandı olarak işaretle"}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            flexShrink: 0,
                            border: sub.status === "completed" ? "none" : `1.5px solid ${c.border}`,
                            background: sub.status === "completed" ? c.accent : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            cursor: "pointer",
                          }}
                        >
                          {sub.status === "completed" && <IconCheck size={8} color="#fff" />}
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: 15,
                                color: sub.status === "completed" ? c.textSecondary : c.textPrimary,
                                textDecoration: sub.status === "completed" ? "line-through" : "none",
                                overflowWrap: "break-word",
                                wordBreak: "break-word",
                              }}
                            >
                              {sub.title}
                            </span>
                            {getTaskMeta?.(sub) && (
                              <span style={{ fontSize: 11, color: c.textSecondary }}>{getTaskMeta(sub)}</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditTask(sub);
                            }}
                            aria-label="Alt görevi düzenle"
                            style={{ background: "transparent", border: "none", padding: 2, display: "flex", flexShrink: 0 }}
                          >
                            <IconEdit size={11} color={c.textSecondary} />
                          </button>
                          {onToggleActive && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleActive(sub.id);
                              }}
                              aria-label={activeTaskId === sub.id ? "Üzerinde çalışmayı bırak" : "Üzerinde çalışıyorum"}
                              title={activeTaskId === sub.id ? "Üzerinde çalışmayı bırak" : "Üzerinde çalışıyorum"}
                              className={activeTaskId === sub.id ? "active-task-pulse" : undefined}
                              style={{
                                background: activeTaskId === sub.id ? `${c.accent}22` : "transparent",
                                border: "none",
                                borderRadius: "50%",
                                padding: 2,
                                display: "flex",
                                flexShrink: 0,
                              }}
                            >
                              <IconActivity size={11} color={activeTaskId === sub.id ? c.accentDark : c.textSecondary} filled={activeTaskId === sub.id} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {subtaskParent === t.id ? (
                    <form onSubmit={(e) => handleAddSubtask(e, t.id)}>
                      <input
                        autoFocus
                        value={subtaskTitle}
                        onChange={(e) => setSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setSubtaskParent(null);
                            setSubtaskTitle("");
                          }
                        }}
                        onBlur={() => commitAddSubtask(t.id)}
                        placeholder="Alt görev başlığı, Enter'a bas"
                        maxLength={200}
                        enterKeyHint="done"
                        style={{ width: "100%", height: 30, fontSize: 15 }}
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => setSubtaskParent(t.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "5px 8px",
                        borderRadius: 7,
                        border: "none",
                        background: "transparent",
                        color: c.textSecondary,
                        fontSize: 15,
                        alignSelf: "flex-start",
                      }}
                    >
                      <IconPlus size={12} color={c.textSecondary} />
                      Alt görev ekle
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ghostGroups.map(({ parent, subtasks }) => (
        <div key={parent.id} style={{ marginBottom: 8 }}>
          <div
            style={{
              opacity: 0.5,
              background: c.surface,
              border: `1px dashed ${c.border}`,
              borderLeft: `3px solid ${columnAccent[parent.status]}`,
              borderRadius: 8,
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 15, color: c.textSecondary, fontStyle: "italic", flex: 1, minWidth: 0, overflowWrap: "break-word", wordBreak: "break-word" }}>{parent.title}</span>
            <span style={{ fontSize: 12, color: c.textSecondary, whiteSpace: "nowrap" }}>{columnLabel[parent.status]}'de</span>
          </div>

          <div
            style={{
              marginLeft: 14,
              marginTop: 6,
              paddingLeft: 12,
              borderLeft: `2px solid ${c.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {subtasks.map((sub) => (
              <div
                key={sub.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 7,
                  padding: "6px 9px",
                }}
              >
                <button
                  onClick={() => onToggleComplete(sub.id)}
                  aria-label="Alt görev tamamlandıyı geri al"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: c.accent,
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <IconCheck size={8} color="#fff" />
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 15,
                      color: c.textSecondary,
                      textDecoration: "line-through",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                  >
                    {sub.title}
                  </span>
                  <button
                    onClick={() => onEditTask(sub)}
                    aria-label="Alt görevi düzenle"
                    style={{ background: "transparent", border: "none", padding: 2, display: "flex", flexShrink: 0 }}
                  >
                    <IconEdit size={11} color={c.textSecondary} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {onCreate &&
        (adding ? (
          <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAdding(false);
                  setTitle("");
                }
              }}
              onBlur={commitAddTask}
              placeholder="Görev başlığı yaz, Enter'a bas"
              maxLength={200}
              enterKeyHint="done"
              style={{ width: "100%", height: 34, fontSize: 16 }}
            />
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: c.textSecondary,
              fontSize: 15,
            }}
          >
            <IconPlus size={14} color={c.textSecondary} />
            Görev ekle
          </button>
        ))}

      {confirmTarget && (
        <Modal title="Görevi tamamla" onClose={() => setConfirmTarget(null)}>
          <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
            <strong style={{ color: c.textPrimary, fontWeight: 500 }}>{confirmTarget.title}</strong> görevini tamamlandı
            olarak işaretleyip "Tamamlandı" bölümüne taşımak istiyor musun?
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setConfirmTarget(null)}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 16 }}
            >
              Vazgeç
            </button>
            <button
              onClick={confirmComplete}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 16, fontWeight: 500 }}
            >
              Tamamlandı olarak işaretle
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
