import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonalBoardItem, PersonalBoardSource, Task, TaskPriority, TaskStatus, User } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import TaskColumn, { TaskColumnHandle } from "../components/TaskColumn";
import TaskEditModal from "../components/TaskEditModal";
import PersonalTodoModal from "../components/PersonalTodoModal";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useLatestRef, useRefreshOnUndo, useUndo } from "../lib/undo";
import { useProjectFabAction } from "../lib/projectFab";
import TaskSortMenu from "../components/TaskSortMenu";
import { sortTasks, type TaskSortMode } from "../lib/taskSort";

// Sıra, uygulamadaki diğer tüm kanbanlarla aynı: önce üzerinde çalışılan işler.
// (bkz. DepartmentTasksPanel, JobTasksPanel, OutputsPanel, ProcessPanel)
const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

type Filter = "all" | PersonalBoardSource;

// Sıra dardan genişe: önce kullanıcının kendi listesi, sonra kendisine
// atananlar, en sonda ikisinin birleşimi.
const FILTERS: { value: Filter; label: string }[] = [
  { value: "personal", label: "Kişisel" },
  { value: "assigned", label: "Bana atananlar" },
  { value: "all", label: "Tümü" },
];

// Sayfa her zaman "Kişisel" ile açılır: burası önce kullanıcının kendi çalışma
// alanı, atanan işler bir sekme ötede. Seçim localStorage'da saklanmıyor —
// hatırlanan bir filtre, sonraki ziyarette görevlerin bir kısmını gizleyip
// kaybolmuş hissi veriyordu.
const DEFAULT_FILTER: Filter = "personal";

/**
 * Yapılacaklar — kullanıcının kişisel kanban panosu.
 *
 * İki tür kart yan yana durur: kendisine atanmış gerçek görevler ve yalnızca
 * kendisinin gördüğü kişisel görevler. Atanan bir kartı taşımak görevin gerçek
 * durumunu değiştirir (projeye yansır); sıralama, kişisel not ve kişisel tarih
 * yansımaz. Böylece kullanıcı ekiple senkronu bozmadan kendi sistemini kurar.
 *
 * Görünüm ve etkileşimler proje/departman kanbanlarıyla ORTAK TaskColumn
 * bileşeninden gelir — kart tasarımı, tamamlama onayı, çift tıkla ad değiştirme,
 * sürükle-bırak ve geri alma her yerde birebir aynı davranır. Bu sayfaya özgü
 * tek fark, kartların alt görev içermemesi (kişisel görevlerin alt görevi yok,
 * atanan görevlerin alt görevleri ise kendi projelerinde yaşar).
 */
export default function TasksOverview() {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  const [items, setItems] = useState<PersonalBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<TaskSortMode>("manual");
  const [editingPersonal, setEditingPersonal] = useState<PersonalBoardItem | null>(null);
  // Atanan kart düzenlenirken görevin TAM kaydı sunucudan çekilir: panodaki
  // kısmi kayıtla açılırsa düzenleyici kaydederken atanan kişi, bütçe ve tahmini
  // süre alanlarını siler (bkz. TaskEditModal.handleSave).
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);
  // Kişisel kartlarda gösterilecek profil fotoğrafı için.
  const [me, setMe] = useState<User | null>(null);
  const columnRefs = useRef<Partial<Record<TaskStatus, TaskColumnHandle | null>>>({});
  // Bir kart "Tamamlandı"dan geri alındığında hangi kolona döneceği.
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const { pushUndo } = useUndo();
  const itemsRef = useLatestRef(items);

  const load = useCallback(() => {
    api
      .get<PersonalBoardItem[]>(`/todos/board?source=${filter}`)
      .then((data) => setItems(data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(load, [load]);
  // Geri/ileri alma sunucu durumunu değiştirir; liste kendini tazelemeli.
  useRefreshOnUndo(load);

  // Görevler proje tarafından da değişebiliyor (başkası tamamlar, atama kalkar).
  // Sekmeye geri dönüldüğünde tazeliyoruz ki kullanıcı eskimiş tabloya bakmasın.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);


  // ------------------------------------------------------------------ Eşleme
  // TaskColumn `Task` konuşuyor; pano `PersonalBoardItem` tutuyor. Kartın hangi
  // kaynaktan geldiğini id üzerinden geri bulabilmek için tek bir sözlük.
  const sourceById = useMemo(() => {
    const map = new Map<string, PersonalBoardSource>();
    for (const i of items) map.set(i.itemId, i.source);
    return map;
  }, [items]);

  // TaskColumn kartları `allTasks` dizisindeki sırayla basar, dolayısıyla seçili
  // ölçüt burada uygulanır. Sıralama mantığı tüm panolarla ortak (lib/taskSort);
  // buradaki tek fark, kişisel kartların tarihinin effectiveDueDate'te olması.
  const sortedItems = useMemo(
    () =>
      sortTasks(
        items.map((i) => ({ ...i, deadline: i.effectiveDueDate, createdAt: i.createdAt, title: i.title })),
        sort
      ),
    [items, sort]
  );

  const tasks: Task[] = useMemo(
    () =>
      sortedItems.map((i) => ({
        id: i.itemId,
        title: i.title,
        description: i.description,
        status: i.status,
        priority: i.priority,
        // Kişisel görevin tarihi olmayabilir; TaskColumn boş tarihi tolere eder.
        deadline: i.effectiveDueDate ?? "",
        createdAt: i.createdAt,
        completedAt: i.completedAt,
        budgetStatus: "pending" as const,
        projectId: i.projectId,
        departmentId: i.departmentId,
      })),
    [sortedItems]
  );

  /** Karta hangi işten geldiğini yazan alt satır. Kişisel kartlarda boş. */
  const getTaskMeta = useCallback(
    (task: Task) => {
      const item = items.find((i) => i.itemId === task.id);
      if (!item || item.source === "personal") return undefined;
      return item.projectTitle ?? item.operationTitle ?? item.departmentName;
    },
    [items]
  );

  /**
   * Kartın başındaki yuvarlak görsel. Atanan kartta görevin bağlı olduğu
   * iş/departman kapağı, kişisel kartta kullanıcının profil fotoğrafı — böylece
   * hangi kartın nereye ait olduğu metni okumadan ayırt edilir.
   */
  const getTaskAvatar = useCallback(
    (task: Task) => {
      const item = items.find((i) => i.itemId === task.id);
      if (!item) return undefined;
      if (item.source === "personal") {
        return { url: me?.avatarUrl, label: me?.fullName ?? "Kişisel görev" };
      }
      return {
        url: item.coverImageUrl,
        label: item.projectTitle ?? item.operationTitle ?? item.departmentName ?? "Atanan görev",
      };
    },
    [items, me]
  );

  // ------------------------------------------------------------- Eylemler

  const handleCreate = async (status: TaskStatus, title: string) => {
    try {
      await api.post("/todos", { title, status });
      load();
    } catch {
      // eklenemedi, kullanıcı tekrar deneyebilir
    }
  };

  const setStatus = useCallback(
    (itemId: string, status: TaskStatus, registerUndo = true) => {
      const source = sourceById.get(itemId);
      if (!source) return;
      const previousStatus = itemsRef.current.find((i) => i.itemId === itemId)?.status;

      setItems((prev) => prev.map((i) => (i.itemId === itemId ? { ...i, status } : i)));
      api.patch("/todos/status", { source, itemId, status }).catch(() => load());

      // registerUndo=false: bu çağrı zaten bir geri alma işleminin kendisi.
      if (registerUndo && previousStatus && previousStatus !== status) {
        pushUndo({
          label: "Görev durumu",
          run: async () => {
            await api.patch("/todos/status", { source, itemId, status: previousStatus });
            load();
          },
          redo: async () => {
            await api.patch("/todos/status", { source, itemId, status });
            load();
          },
        });
      }
    },
    [sourceById, itemsRef, pushUndo, load]
  );

  const handleReorder = (ids: string[]) => {
    if (!ids.length) return;
    const affected = new Set(ids);
    const previousIds = itemsRef.current.filter((i) => affected.has(i.itemId)).map((i) => i.itemId);

    // TaskColumn kartları `allTasks` dizisindeki sırayla basar; yalnızca
    // sortOrder alanını güncellemek ekranda hiçbir şeyi değiştirmezdi. Diğer
    // kanbanlarla aynı şekilde dizinin kendisini yeniden diziyoruz
    // (bkz. DepartmentTasksPanel.handleReorderTasks).
    setItems((prev) => {
      const order = new Map(ids.map((id, index) => [id, index]));
      const moved = prev.filter((i) => order.has(i.itemId));
      const untouched = prev.filter((i) => !order.has(i.itemId));
      moved.sort((a, b) => order.get(a.itemId)! - order.get(b.itemId)!);
      return [...untouched, ...moved.map((i) => ({ ...i, sortOrder: order.get(i.itemId)! }))];
    });

    const toPayload = (list: string[]) =>
      list
        .map((id) => ({ source: sourceById.get(id), itemId: id }))
        .filter((x): x is { source: PersonalBoardSource; itemId: string } => Boolean(x.source));

    api.patch("/todos/reorder", { items: toPayload(ids) }).catch(() => load());

    // Diğer kanbanlarla aynı geri alma davranışı; yalnızca gövde şekli farklı
    // olduğu için ortak yardımcı yerine elle kaydediyoruz.
    pushUndo({
      label: "Görev sırası",
      run: async () => {
        await api.patch("/todos/reorder", { items: toPayload(previousIds) });
        load();
      },
      redo: async () => {
        await api.patch("/todos/reorder", { items: toPayload(ids) });
        load();
      },
    });
  };

  const handleToggleComplete = (itemId: string) => {
    const item = items.find((i) => i.itemId === itemId);
    if (!item) return;
    if (item.status === "completed") {
      const previous = previousStatusRef.current[itemId] ?? "todo";
      delete previousStatusRef.current[itemId];
      setStatus(itemId, previous);
    } else {
      previousStatusRef.current[itemId] = item.status;
      setStatus(itemId, "completed");
    }
  };

  /**
   * Çift tıklayarak ad değiştirme. TaskColumn varsayılan olarak PATCH /tasks/:id
   * atar; kişisel kartlar başka uçta yaşadığı için isteği burada karşılıyoruz.
   */
  const handleRename = async (task: Task, title: string): Promise<Task> => {
    const source = sourceById.get(task.id);
    if (source === "personal") {
      await api.patch(`/todos/${task.id}`, { title });
    } else {
      await api.patch(`/tasks/${task.id}`, { title });
    }
    return { ...task, title };
  };

  const handleRenamed = (updated: Task) => {
    setItems((prev) =>
      prev.map((i) => (i.itemId === updated.id ? { ...i, title: updated.title, priority: updated.priority } : i))
    );
  };

  /**
   * Öncelik yıldızı. TaskColumn varsayılan olarak PATCH /tasks/:id atar; kişisel
   * kartlar başka uçta yaşadığı için isteği burada karşılıyoruz.
   */
  const handleSetPriority = async (task: Task, priority: TaskPriority): Promise<Task> => {
    const source = sourceById.get(task.id);
    if (source === "personal") {
      await api.patch(`/todos/${task.id}`, { priority });
    } else {
      await api.patch(`/tasks/${task.id}`, { priority });
    }
    return { ...task, priority };
  };

  // "Üzerinde çalışıyorum" yalnızca gerçek görevlerde anlamlı: users.active_task_id
  // tasks tablosuna FK, kişisel bir görev oraya yazılamaz.
  const canToggleActive = useCallback(
    (task: Task) => sourceById.get(task.id) === "assigned",
    [sourceById]
  );

  // Diğer sayfalarla aynı davranış (bkz. ProjectDetail.handleToggleActive):
  // aynı göreve tekrar basmak işareti kaldırır.
  const handleToggleActive = (taskId: string) => {
    if (sourceById.get(taskId) !== "assigned") return;
    const turningOn = activeTaskId !== taskId;
    setActiveTaskId(turningOn ? taskId : undefined);
    api.patch(`/tasks/${taskId}/active-worker`, { active: turningOn }).catch(() => {
      setActiveTaskId((prev) => (turningOn ? undefined : prev));
    });
  };

  const openEditor = async (task: Task) => {
    const item = items.find((i) => i.itemId === task.id);
    if (!item) return;
    if (item.source === "personal") {
      setEditingPersonal(item);
      return;
    }
    try {
      setEditingTask(await api.get<Task>(`/todos/assigned/${item.itemId}`));
    } catch {
      // görev çekilemedi (başkasına atanmış olabilir); pano tazelensin
      load();
    }
  };

  // Alt navigasyondaki "+" bu sayfada yeni kişisel görev ekler (varsayılan "Yeni iş"
  // değil). Sütunun kendi hızlı ekleme kutusunu açıyoruz — diğer kanbanlarda FAB
  // da tam olarak böyle davranıyor (bkz. DepartmentTasksPanel.openCreate).
  const startQuickAdd = useCallback(() => {
    // "Bana atananlar" filtresindeyken eklenen kart kişisel olduğu için o filtrede
    // görünmez ve kullanıcı görevin kaybolduğunu sanır. Filtreyi "Tümü"ne alıyoruz.
    if (filter === "assigned") setFilter("all");
    columnRefs.current.todo?.openCreate();
  }, [filter]);
  useProjectFabAction({ label: "Yeni görev", onClick: startQuickAdd }, [startQuickAdd]);

  // Tek çağrı iki işe yarıyor: aktif görev işareti (users.active_task_id, diğer
  // sayfalarla aynı kaynak) ve kişisel kartlarda gösterilen profil fotoğrafı.
  useEffect(() => {
    api
      .get<User | null>("/auth/me")
      .then((user) => {
        setMe(user);
        setActiveTaskId(user?.activeTaskId);
      })
      .catch(() => {
        setMe(null);
        setActiveTaskId(undefined);
      });
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: "28px 28px 40px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Yapılacaklar</h1>

        <div role="group" aria-label="Kaynak filtresi" style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: `1px solid ${filter === f.value ? c.primary : c.border}`,
                background: filter === f.value ? `${c.primary}12` : c.surface,
                color: filter === f.value ? c.textPrimary : c.textSecondary,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sıralama ölçütü. Filtrenin hemen yanında ama ayrı bir kontrol:
            filtre neyin görüneceğini, bu ise hangi düzende görüneceğini seçer. */}
        <TaskSortMenu value={sort} onChange={setSort} />
      </header>

      <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 18px" }}>
        {sort !== "manual"
          ? "Kartlar seçtiğin ölçüte göre sıralı; kendi sıranı düzenlemek için “Kendi sıram”a dön."
          : filter === "assigned"
          ? "Sana atanmış görevler. Buradaki sıralama yalnızca sana görünür."
          : "Kişisel görevlerini senden başkası görmez."}
      </p>

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>
      ) : (
        // Masaüstünde üç sütun yan yana, dar ekranda alt alta — diğer kanbanlarla
        // aynı yerleşim (bkz. DepartmentTasksPanel).
        <div
          style={{
            display: "flex",
            flexDirection: isDesktop ? "row" : "column",
            alignItems: isDesktop ? "flex-start" : undefined,
            gap: 14,
            overflowX: isDesktop ? "auto" : undefined,
          }}
        >
          {columns.map((status) => (
            <div key={status} style={isDesktop ? { flex: "1 1 260px", minWidth: 260 } : { width: "100%" }}>
              <TaskColumn
                ref={(el) => {
                  columnRefs.current[status] = el;
                }}
                status={status}
                allTasks={tasks}
                onCreate={handleCreate}
                onMove={setStatus}
                onToggleComplete={handleToggleComplete}
                onEditTask={openEditor}
                onTaskRenamed={handleRenamed}
                onRenameTask={handleRename}
                onSetPriority={handleSetPriority}
                // Başka bir ölçütle sıralıyken kolon içinde sürükleyip sıra
                // değiştirmek anlamsız: kart bırakıldığı yerde durmaz, ölçüte göre
                // geri sıçrar. Bu yüzden sıralama kapatılıyor — kolonlar arası
                // taşıma (durum değişikliği) çalışmaya devam ediyor.
                onReorderTasks={sort === "manual" ? handleReorder : undefined}
                activeTaskId={activeTaskId}
                onToggleActive={handleToggleActive}
                canToggleActive={canToggleActive}
                getTaskMeta={getTaskMeta}
                getTaskAvatar={getTaskAvatar}
                group="personal-board"
              />
            </div>
          ))}
        </div>
      )}

      {/* Atanan kart gerçek görev düzenleyicisini açar — proje sayfasındakiyle
          birebir aynı ekran. Kişisel kartın kendi hafif düzenleyicisi var. */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null);
            load();
          }}
          onDeleted={() => {
            setEditingTask(null);
            load();
          }}
          onArchived={() => {
            setEditingTask(null);
            load();
          }}
        />
      )}

      {editingPersonal && (
        <PersonalTodoModal
          item={editingPersonal}
          onClose={() => setEditingPersonal(null)}
          onChanged={() => {
            setEditingPersonal(null);
            load();
          }}
        />
      )}
    </div>
  );
}
