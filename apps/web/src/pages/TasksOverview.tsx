import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonalBoardItem, PersonalBoardSource, PersonalTodo, Task, TaskPriority, TaskStatus, User } from "@projelio/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import TaskColumn, { TaskColumnHandle } from "../components/TaskColumn";
import { YapilacakListeSekmeleri, listedekiler, useYapilacakListeleri, yapilacakListeApi } from "../components/YapilacakListeleri";
import TaskEditModal from "../components/TaskEditModal";
import PersonalTodoModal from "../components/PersonalTodoModal";
import TaskSelectionBar from "../components/TaskSelectionBar";
import BulkConvertHierarchyModal from "../components/BulkConvertHierarchyModal";
import ConfirmDialog from "../components/ConfirmDialog";
import MoveTaskModal from "../components/MoveTaskModal";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useLatestRef, useRefreshOnUndo, useUndo } from "../lib/undo";
import { useProjectFabAction } from "../lib/projectFab";
import { useTaskSelection } from "../lib/useTaskSelection";
import { selectedLioTasks } from "../lib/askLio";
import { usePageHeader, usePageHeaderActions, usePageHeaderTabs } from "../lib/pageHeader";
import TaskSortMenu from "../components/TaskSortMenu";
import { sortTasks, type TaskSortMode } from "../lib/taskSort";
import { backState } from "../lib/backTarget";
import { useDragScroll } from "../lib/useDragScroll";
import { useT } from "../lib/i18n";
import { departmanAdi } from "../lib/departmanAdi";
import { suresiGectiMi } from "../lib/gecikme";
import { altGorevHatasiniBildir, gorevDurumHatasiniBildir } from "../lib/taskBlockNotice";

// Sıra, uygulamadaki diğer tüm kanbanlarla aynı: önce üzerinde çalışılan işler.
// (bkz. DepartmentTasksPanel, JobTasksPanel, OutputsPanel, ProcessPanel)
const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

type Filter = "all" | PersonalBoardSource;

// Sıra dardan genişe: önce kullanıcının kendi listesi, sonra iş görevleri, en
// sonda ikisinin birleşimi.
//
// "Bana atananlar" yerine "İş görevlerim": bu kol artık yalnızca başkasının
// atadığı görevleri değil, kullanıcının kendi açtığı (atama yapılmadığında
// kendisine atanan, bkz. tasks.service createForProject) proje görevlerini de
// içeriyor — eski etiket yanıltıcı kalıyordu.
// Etiketler modül düzeyinde: t() burada çağrılamaz, Türkçe metin ANAHTAR olarak
// duruyor ve çeviri kullanıldığı yerde yapılıyor (bkz. aşağıda `t(f.label)`).
const FILTERS: { value: Filter; label: string }[] = [
  { value: "personal", label: "Kişisel" }, // dil:anahtar
  { value: "assigned", label: "İş görevlerim" }, // dil:anahtar
  { value: "all", label: "Tümü" }, // dil:anahtar
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
 * sürükle-bırak ve geri alma her yerde birebir aynı davranır.
 *
 * ALT GÖREVLER (2026-11): eskiden burada hiç yoktu — TaskColumn yalnızca üst
 * görevleri kart yapıyor, alt görevleri üst görevin içinde açıyor; panoda üst
 * görevi olmayan alt görev bu yüzden hiç çizilmiyordu, panodaki üst görevin
 * (bana atanmamış) alt görevleri de gelmiyordu. Artık proje içindeki gibi:
 *  - panodaki üst görevin TÜM alt görevleri kartın içinde (`altGorevler`,
 *    GET /todos/board/subtasks — taşeron kuralı sunucuda),
 *  - bana atanmış ama üst görevi panoda olmayan alt görev kendi kartıyla
 *    (bkz. TaskColumn "yetim" alt görev),
 *  - alt görev ekleme, sürükleyerek seviye değiştirme, sıralama.
 * `altGorevler` PANOYA KARIŞMAZ (items'a girmez): pano "bana atananlar"dır;
 * başkasının alt görevi ana sayfa sayaçlarında benim işim gibi görünmemeli.
 * O kartlardaki eylemler panonun değil görevin kendi uçlarına gider (/tasks).
 * Kişisel görevlerin alt görevi yok.
 */
export default function TasksOverview() {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  // Pano yalnızca masaüstünde yana kayıyor; dar ekranda sütunlar alt alta.
  const boardScrollRef = useDragScroll<HTMLDivElement>(isDesktop);
  const [items, setItems] = useState<PersonalBoardItem[]>([]);
  // Panodaki üst görevlerin alt görevleri (bkz. dosya başı). Panonun parçası değil.
  const [altGorevler, setAltGorevler] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  // Filtre URL'de tutuluyor — ama HATIRLANMIYOR.
  //
  // Ayrım önemli: sayfaya çıplak `/tasks` ile gelen herkes yine "Kişisel"
  // görüyor (yukarıdaki karar değişmedi). Yalnızca bir görev kartından çıkıp
  // geri dönen kullanıcı, çıktığı sekmeye geri düşüyor; çünkü geri bağlantısı
  // adresi de yanında taşıyor (bkz. openTaskSource / lib/backTarget.ts).
  // Yerel state'te tutulduğunda dönüş her seferinde "Kişisel"e çakılıyordu.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParam = searchParams.get("filter");
  const filter: Filter = FILTERS.some((f) => f.value === filterParam) ? (filterParam as Filter) : DEFAULT_FILTER;
  const setFilter = useCallback(
    (next: Filter) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === DEFAULT_FILTER) params.delete("filter");
          else params.set("filter", next);
          // Sekme elle değiştirildiyse "şu göreve odaklan" isteği geçersiz.
          params.delete("focus");
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // "Süresi geçen" — kaynak filtresinden BAĞIMSIZ bir anahtar: "İş görevlerim"
  // ile birlikte "işlerimden gecikenler" gibi okunur. Adreste duruyor ki
  // karttan çıkıp geri dönen kullanıcı aynı görünüme düşsün; ama kaynak
  // filtresi gibi HATIRLANMIYOR (bkz. yukarıdaki filtre notu).
  const sadeceGecikenler = searchParams.get("gecikmis") === "1";
  const setSadeceGecikenler = useCallback(
    (acik: boolean) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (acik) params.set("gecikmis", "1");
          else params.delete("gecikmis");
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Açık yapılacak listesi (migration 185) — filtre gibi adreste; "" = Tümü.
  const seciliListe = searchParams.get("liste") ?? "";
  const setSeciliListe = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (id) params.set("liste", id);
          else params.delete("liste");
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const yapilacakListeleri = useYapilacakListeleri();

  // Geri dönüşte çıkılan kartı bul, ona kaydır ve parlat (bkz. TaskColumn).
  const [highlightTaskId, setHighlightTaskId] = useState<string | undefined>(undefined);
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
  const { pushUndo, pushDestructive } = useUndo();
  const itemsRef = useLatestRef(items);
  const selection = useTaskSelection();
  const [archiving, setArchiving] = useState(false);
  const [confirmingBulkAction, setConfirmingBulkAction] = useState<"archive" | "delete" | null>(null);
  const [movingOpen, setMovingOpen] = useState(false);
  // Sabit şeridin ölçtüğü öğeler (bkz. lib/pageHeader): sayfanın başlık satırı
  // "kapak" yerine geçer, filtreler ve araç çubuğu ise kendi kopyaları şeritte
  // belirmeden önce gerçekten ekrandan çıkmış olmalı.
  const headerRef = useRef<HTMLElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<PersonalBoardItem[]>(`/todos/board?source=${filter}`)
      .then((data) => setItems(data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    // "Kişisel" sekmesinde atanan görev yok, dolayısıyla alt görevleri de yok.
    // Hata panoyu düşürmesin: alt görevler gelmezse kartlar eskisi gibi durur.
    if (filter === "personal") setAltGorevler([]);
    else
      api
        .get<Task[]>("/todos/board/subtasks")
        .then((data) => setAltGorevler(data ?? []))
        .catch(() => setAltGorevler([]));
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

  // "Taşı" yalnızca atanan (gerçek) görevler için anlamlı: kişisel görevlerin
  // bağlı olacağı bir proje/departman kavramı yok. Seçim kişisel+atanan
  // karışık olabileceği için taşınabilir alt küme burada ayrıca hesaplanır.
  /** Toplu seviye dönüştürme penceresi (bkz. BulkConvertHierarchyModal). */
  const [convertOpen, setConvertOpen] = useState(false);

  const movableSelectedIds = useMemo(
    () => Array.from(selection.selectedIds).filter((taskId) => sourceById.get(taskId) === "assigned"),
    [selection.selectedIds, sourceById]
  );

  // TaskColumn kartları `allTasks` dizisindeki sırayla basar, dolayısıyla seçili
  // ölçüt burada uygulanır. Sıralama mantığı tüm panolarla ortak (lib/taskSort);
  // buradaki tek fark, kişisel kartların tarihinin effectiveDueDate'te olması.
  const sortedItems = useMemo(
    () =>
      sortTasks(
        listedekiler(items, seciliListe).map((i) => ({ ...i, deadline: i.effectiveDueDate, createdAt: i.createdAt, title: i.title })),
        sort
      ),
    [items, sort, seciliListe]
  );

  const panoGorevleri: Task[] = useMemo(
    () =>
      sortedItems.map((i) => ({
        id: i.itemId,
        title: i.title,
        description: i.description,
        status: i.status,
        priority: i.priority,
        // Kişisel görevin tarihi olmayabilir; TaskColumn boş tarihi tolere eder.
        deadline: i.effectiveDueDate ?? "",
        // Bitiş saati (bkz. 057/058): kart tarihin yanında saati de gösterir.
        deadlineTime: i.deadlineTime,
        createdAt: i.createdAt,
        completedAt: i.completedAt,
        budgetStatus: "pending" as const,
        projectId: i.projectId,
        departmentId: i.departmentId,
        // Seviye dönüştürme alt görevi üst görevden ayırt edebilsin diye
        // (bkz. migration 068 — panoya bu kolon oradan geliyor).
        parentTaskId: i.parentTaskId,
      })),
    [sortedItems]
  );

  // Alt görevler yalnızca üst görevleri EKRANDAYSA eklenir: liste ya da sekme
  // üst görevi gizlediyse alt görevleri de gizlenir (yoksa üstsüz kart olarak
  // panoya düşerlerdi). Panoda zaten olan (bana atanmış) alt görev tekrar
  // eklenmez. Sıra projedeki sırayla aynı.
  const ekAltGorevler: Task[] = useMemo(() => {
    const panodakiler = new Set(panoGorevleri.map((g) => g.id));
    return altGorevler
      .filter((g) => g.parentTaskId && panodakiler.has(g.parentTaskId) && !panodakiler.has(g.id))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [panoGorevleri, altGorevler]);
  const ekGorevById = useMemo(() => new Map(ekAltGorevler.map((g) => [g.id, g])), [ekAltGorevler]);
  const tumGorevler: Task[] = useMemo(() => [...panoGorevleri, ...ekAltGorevler], [panoGorevleri, ekAltGorevler]);

  // Süresi geçen filtresi. Kural kırmızı kartlarla aynı (bkz. lib/gecikme).
  // Kendisi gecikmemiş ama alt görevi gecikmiş üst görev de KALIR: yoksa
  // gecikmiş alt görev üstsüz kalır ve "yetim" kart olarak ayrıca çizilirdi —
  // oysa proje içindeki gibi üst görevinin altında görünmesi gerekiyor.
  const gecikenIdleri = useMemo(() => {
    const idler = new Set<string>();
    for (const g of tumGorevler) if (suresiGectiMi(g)) idler.add(g.id);
    return idler;
  }, [tumGorevler]);
  const tasks: Task[] = useMemo(() => {
    if (!sadeceGecikenler) return tumGorevler;
    const ustler = new Set<string>();
    for (const g of tumGorevler) if (g.parentTaskId && gecikenIdleri.has(g.id)) ustler.add(g.parentTaskId);
    return tumGorevler.filter((g) => gecikenIdleri.has(g.id) || ustler.has(g.id));
  }, [tumGorevler, gecikenIdleri, sadeceGecikenler]);
  const tasksRef = useLatestRef(tasks);

  /**
   * Karta çift tıklandığında görevin yaşadığı sayfaya götürür ve orada kartı
   * parlatır (bkz. ProjectDetail — location.state.highlightTaskId).
   *
   * Kişisel görevlerin gidilecek bir sayfası yok; onlarda hiçbir şey yapmaz.
   */
  const openTaskSource = useCallback(
    (task: Task) => {
      const ek = ekGorevById.get(task.id);
      const item = ek
        ? { source: "assigned" as const, projectId: ek.projectId, departmentId: ek.departmentId }
        : items.find((i) => i.itemId === task.id);
      if (!item || item.source === "personal") return;
      // Geri bağlantısı SADECE sayfaya değil, tam olarak bulunduğumuz yere
      // dönsün: açık sekme ve çıkılan kart adreste taşınıyor (bkz.
      // lib/backTarget.ts, yukarıdaki focus efekti).
      const params = new URLSearchParams();
      if (filter !== DEFAULT_FILTER) params.set("filter", filter);
      params.set("focus", task.id);
      const from = { to: `/tasks?${params.toString()}`, label: t("Yapılacaklar") };
      if (item.projectId) {
        navigate(`/projects/${item.projectId}`, {
          state: { highlightTaskId: task.id, ...backState(from) },
        });
        return;
      }
      if (item.departmentId) {
        navigate(`/departments/${item.departmentId}?tab=tasks`, {
          state: { highlightTaskId: task.id, ...backState(from) },
        });
      }
    },
    [items, ekGorevById, navigate, filter]
  );

  /** Karta hangi işten geldiğini yazan alt satır. Kişisel kartlarda boş. */
  const getTaskMeta = useCallback(
    (task: Task) => {
      const item = items.find((i) => i.itemId === task.id);
      if (!item || item.source === "personal") return undefined;
      return item.projectTitle ?? item.operationTitle ?? departmanAdi(item.departmentName, t);
    },
    [items, t]
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
        return { url: me?.avatarUrl, label: me?.fullName ?? t("Kişisel görev") };
      }
      return {
        url: item.coverImageUrl,
        label: item.projectTitle ?? item.operationTitle ?? departmanAdi(item.departmentName, t) ?? t("Atanan görev"),
      };
    },
    [items, me]
  );

  // ------------------------------------------------------------- Eylemler

  /**
   * Yeni kart oluşturmayı geri alınabilir yapar. "todos/:id" DELETE'i kalıcı
   * silmiyor, arşivliyor (bkz. PersonalTodosService.archive) — o yüzden geri
   * alma burada da diğer panellerdeki gibi sil+yeniden oluştur örüntüsünü
   * kullanabiliyor, ama silme adımı aslında zararsız bir arşivleme.
   */
  const registerTodoCreateUndo = (createdId: string, payload: { title: string; status: TaskStatus }) => {
    let currentId = createdId;
    pushUndo({
      label: t("Görev oluşturma"),
      run: async () => {
        await api.delete(`/todos/${currentId}`);
        load();
      },
      redo: async () => {
        const recreated = await api.post<PersonalTodo>("/todos", payload);
        currentId = recreated.id;
        load();
      },
    });
  };

  const handleCreate = async (status: TaskStatus, title: string) => {
    try {
      // Liste açıkken eklenen kart o listeye girer, yoksa eklendiği an gözden kaybolurdu.
      const created = await api.post<PersonalTodo>("/todos", { title, status, listeId: seciliListe || undefined });
      load();
      registerTodoCreateUndo(created.id, { title, status });
    } catch {
      // eklenemedi, kullanıcı tekrar deneyebilir
    }
  };

  const setStatus = useCallback(
    (itemId: string, status: TaskStatus, registerUndo = true) => {
      const source = sourceById.get(itemId);
      if (!source) {
        // Panoda olmayan alt görev: görevin kendi ucuna gider (proje kanbanıyla aynı).
        const ek = ekGorevById.get(itemId);
        if (!ek) return;
        const onceki = ek.status;
        const yaz = (durum: TaskStatus) =>
          setAltGorevler((prev) => prev.map((g) => (g.id === itemId ? { ...g, status: durum } : g)));
        yaz(status);
        api.patchKuyruklu(`/tasks/${itemId}/status`, { status }).catch((err) => {
          gorevDurumHatasiniBildir(err);
          load();
        });
        if (registerUndo && onceki !== status) {
          pushUndo({
            label: t("Görev durumu"),
            run: async () => {
              await api.patch(`/tasks/${itemId}/status`, { status: onceki });
              load();
            },
            redo: async () => {
              await api.patch(`/tasks/${itemId}/status`, { status });
              load();
            },
          });
        }
        return;
      }
      const previousStatus = itemsRef.current.find((i) => i.itemId === itemId)?.status;

      setItems((prev) => prev.map((i) => (i.itemId === itemId ? { ...i, status } : i)));
      api.patchKuyruklu("/todos/status", { source, itemId, status }).catch(() => load());

      // registerUndo=false: bu çağrı zaten bir geri alma işleminin kendisi.
      if (registerUndo && previousStatus && previousStatus !== status) {
        pushUndo({
          label: t("Görev durumu"),
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
    [sourceById, ekGorevById, itemsRef, pushUndo, load]
  );

  const handleReorder = (ids: string[]) => {
    if (!ids.length) return;
    // Alt görev sırası (kartın içindeki liste): kişisel pano sırası değil,
    // görevin projedeki sırası — proje kanbanıyla aynı uç. Bana atanmış alt
    // görevler de gerçek görev olduğu için aynı istekte.
    const gorevlerNow = new Map(tasksRef.current.map((g) => [g.id, g]));
    if (ids.every((id) => gorevlerNow.get(id)?.parentTaskId)) {
      const oncekiIdler = tasksRef.current.filter((g) => ids.includes(g.id)).map((g) => g.id);
      const sira = new Map(ids.map((id, index) => [id, index]));
      setAltGorevler((prev) => prev.map((g) => (sira.has(g.id) ? { ...g, sortOrder: sira.get(g.id)! } : g)));
      api.patch("/tasks/reorder", { ids }).catch(() => load());
      pushUndo({
        label: t("Görev sırası"),
        run: async () => {
          await api.patch("/tasks/reorder", { ids: oncekiIdler });
          load();
        },
        redo: async () => {
          await api.patch("/tasks/reorder", { ids });
          load();
        },
      });
      return;
    }
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
      label: t("Görev sırası"),
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

  const removeItemsFromState = (ids: string[]) => {
    const removed = new Set(ids);
    setItems((prev) => prev.filter((i) => !removed.has(i.itemId)));
  };

  /**
   * Seçili kartları toplu arşivler. Pano iki ayrı kaynağı karıştırdığı için
   * (bkz. dosya başı açıklaması) seçim, kişisel ve atanan id'lere ayrılıp her
   * biri kendi uç noktasına gönderilir; tek bir Cmd/Ctrl+Z ikisini de geri alır.
   */
  const handleArchiveSelected = async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0) return;
    const personalIds = ids.filter((id) => sourceById.get(id) === "personal");
    const assignedIds = ids.filter((id) => sourceById.get(id) === "assigned");
    setArchiving(true);
    try {
      await Promise.all([
        ...personalIds.map((id) => api.delete(`/todos/${id}`)),
        assignedIds.length ? api.patch<Task[]>("/tasks/bulk-archive", { ids: assignedIds }) : Promise.resolve(undefined),
      ]);
      removeItemsFromState(ids);
      pushUndo({
        label: t("{n} görev arşivleme", { n: ids.length }),
        run: async () => {
          await Promise.all([
            ...personalIds.map((id) => api.patch(`/todos/${id}/restore`, {})),
            ...assignedIds.map((id) => api.patch(`/tasks/${id}/restore`, {})),
          ]);
          load();
        },
        redo: async () => {
          await Promise.all([
            ...personalIds.map((id) => api.delete(`/todos/${id}`)),
            assignedIds.length ? api.patch("/tasks/bulk-archive", { ids: assignedIds }) : Promise.resolve(undefined),
          ]);
          load();
        },
      });
      selection.clear();
      setConfirmingBulkAction(null);
    } finally {
      setArchiving(false);
    }
  };

  /**
   * Seçili kartları toplu siler. Kişisel görevlerde gerçek bir silme uç noktası
   * yok — "todos/:id" DELETE'i zaten arşivliyor (bkz. PersonalTodosService.archive) —
   * o yüzden kişisel kartlar için bu, süresiz geri alınabilir bir arşivleme.
   * Atanan kartlarda ise gerçek/kalıcı silme var; diğer panellerdeki gibi
   * birkaç saniye ertelenmiş commit ile Cmd/Ctrl+Z penceresi açılır
   * (bkz. lib/undo pushDestructive). İki kaynak karışık seçildiyse iki ayrı
   * geri alma girdisi oluşur, ikisi de kendi Cmd/Ctrl+Z'siyle geri alınabilir.
   */
  const handleDeleteSelected = () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0) return;
    const personalIds = ids.filter((id) => sourceById.get(id) === "personal");
    const assignedIds = ids.filter((id) => sourceById.get(id) === "assigned");
    removeItemsFromState(ids);

    if (personalIds.length > 0) {
      Promise.all(personalIds.map((id) => api.delete(`/todos/${id}`))).catch(() => load());
      pushUndo({
        label: t("{n} kişisel görev silme", { n: personalIds.length }),
        run: async () => {
          await Promise.all(personalIds.map((id) => api.patch(`/todos/${id}/restore`, {})));
          load();
        },
        redo: async () => {
          await Promise.all(personalIds.map((id) => api.delete(`/todos/${id}`)));
          load();
        },
      });
    }

    if (assignedIds.length > 0) {
      pushDestructive({
        label: t("{n} görev silme", { n: assignedIds.length }),
        commit: () => api.post("/tasks/bulk-delete", { ids: assignedIds }),
        restore: () => {},
        entityIds: assignedIds,
      });
    }

    selection.clear();
    setConfirmingBulkAction(null);
  };

  const handleToggleComplete = (itemId: string) => {
    const item = items.find((i) => i.itemId === itemId) ?? ekGorevById.get(itemId);
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
    setAltGorevler((prev) => prev.map((g) => (g.id === updated.id ? { ...g, ...updated } : g)));
    setItems((prev) =>
      prev.map((i) =>
        i.itemId === updated.id
          ? { ...i, title: updated.title, priority: updated.priority, effectiveDueDate: updated.deadline || i.effectiveDueDate }
          : i
      )
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

  /**
   * Karttaki tarihe çift tıklayıp değiştirme (bkz. TaskColumn.renderDue).
   * Kişisel kartın tarihi kendi ucunda (dueDate), atanan kartınki görevde.
   */
  const handleSetDeadline = async (task: Task, deadline: string): Promise<Task> => {
    const source = sourceById.get(task.id);
    if (source === "personal") {
      await api.patch(`/todos/${task.id}`, { dueDate: deadline });
    } else {
      await api.patch(`/tasks/${task.id}`, { deadline });
    }
    return { ...task, deadline };
  };

  // Kişisel görevin alt görevi yok (bkz. TaskColumn canHaveSubtasks).
  const canHaveSubtasks = useCallback((task: Task) => sourceById.get(task.id) !== "personal", [sourceById]);

  // "Üzerinde çalışıyorum" yalnızca gerçek görevlerde anlamlı: users.active_task_id
  // tasks tablosuna FK, kişisel bir görev oraya yazılamaz.
  const canToggleActive = useCallback(
    (task: Task) => sourceById.get(task.id) === "assigned" || ekGorevById.has(task.id),
    [sourceById, ekGorevById]
  );

  // Diğer sayfalarla aynı davranış (bkz. ProjectDetail.handleToggleActive):
  // aynı göreve tekrar basmak işareti kaldırır.
  const handleToggleActive = (taskId: string) => {
    if (sourceById.get(taskId) !== "assigned" && !ekGorevById.has(taskId)) return;
    const turningOn = activeTaskId !== taskId;
    setActiveTaskId(turningOn ? taskId : undefined);
    api.patch(`/tasks/${taskId}/active-worker`, { active: turningOn }).catch(() => {
      setActiveTaskId((prev) => (turningOn ? undefined : prev));
    });
  };

  const openEditor = async (task: Task) => {
    if (ekGorevById.has(task.id)) {
      // Panoda olmayan alt görev: tam kayıt görevin kendi ucundan (erişim orada).
      try {
        setEditingTask(await api.get<Task>(`/tasks/${task.id}`));
      } catch {
        load();
      }
      return;
    }
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

  /**
   * Alt görev ekleme — proje kanbanıyla aynı kural (bkz. JobDetail.handleCreateSubtask):
   * alt görev üst görevin kapsamında açılır, durumunu ve tarihini ondan alır.
   * Kişisel görevin alt görevi yok; TaskColumn ekleme kutusunu yine de
   * gösterebileceği için burada sessizce reddediliyor.
   */
  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    const parent = tasksRef.current.find((g) => g.id === parentTaskId);
    if (!parent || sourceById.get(parentTaskId) === "personal") return;
    const yol = parent.projectId
      ? `/projects/${parent.projectId}/tasks`
      : parent.departmentId
        ? `/departments/${parent.departmentId}/tasks`
        : null;
    if (!yol) return;
    const payload = { title, status: parent.status, deadline: parent.deadline || undefined, parentTaskId };
    try {
      let olusan = await api.post<Task>(yol, payload);
      setAltGorevler((prev) => [...prev, olusan]);
      pushUndo({
        label: t("Görev oluşturma"),
        run: async () => {
          await api.delete(`/tasks/${olusan.id}`);
          load();
        },
        redo: async () => {
          olusan = await api.post<Task>(yol, payload);
          load();
        },
      });
    } catch (err) {
      altGorevHatasiniBildir(err);
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
  useProjectFabAction({ label: t("Yeni görev"), onClick: startQuickAdd }, [startQuickAdd]);

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

  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus) return;
    setHighlightTaskId(focus);
    // Adresten hemen siliniyor: yenilemede ya da ileri/geri gezinmede aynı
    // karta tekrar zıplamasın. Vurgu state'te yaşamaya devam ediyor, kartlar
    // sunucudan sonra düşse bile kaydırma çalışıyor.
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("focus");
        return params;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!highlightTaskId) return;
    const timer = setTimeout(() => setHighlightTaskId(undefined), 3500);
    return () => clearTimeout(timer);
  }, [highlightTaskId]);

  const filterButtons = (
    <div role="group" aria-label={t("Kaynak filtresi")} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => {
            selection.clear();
            setFilter(f.value);
          }}
          aria-pressed={filter === f.value}
          style={{
            padding: "8px 16px",
            fontSize: 15,
            borderRadius: 8,
            whiteSpace: "nowrap",
            border: `1px solid ${filter === f.value ? c.primary : c.border}`,
            background: filter === f.value ? `${c.primary}12` : c.surface,
            color: filter === f.value ? c.textPrimary : c.textSecondary,
          }}
        >
          {t(f.label)}
        </button>
      ))}
      {/* Kaynak filtrelerinden ayrı bir anahtar (bkz. sadeceGecikenler): araya
          ince bir ayraç, sayı her zaman görünür ki açmadan "kaç tane" bilinsin. */}
      <span aria-hidden style={{ width: 1, alignSelf: "stretch", margin: "4px 6px", background: c.border }} />
      <button
        onClick={() => {
          selection.clear();
          setSadeceGecikenler(!sadeceGecikenler);
        }}
        aria-pressed={sadeceGecikenler}
        style={{
          padding: "8px 16px",
          fontSize: 15,
          borderRadius: 8,
          whiteSpace: "nowrap",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: `1px solid ${sadeceGecikenler ? c.danger : c.border}`,
          background: sadeceGecikenler ? `${c.danger}12` : c.surface,
          color: sadeceGecikenler ? c.textPrimary : c.textSecondary,
        }}
      >
        {t("Süresi geçen")}
        {gecikenIdleri.size > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: c.danger }}>{gecikenIdleri.size}</span>
        )}
      </button>
    </div>
  );

  const sortAndSelect = (
    <>
      <TaskSortMenu value={sort} onChange={setSort} />
      <TaskSelectionBar
        inline
        selectionMode={selection.selectionMode}
        selectedCount={selection.selectedIds.size}
        busy={archiving}
        onEnable={selection.toggleSelectionMode}
        onCancel={selection.clear}
        onMove={movableSelectedIds.length > 0 ? () => setMovingOpen(true) : undefined}
        // Kişisel yapılacaklar görev değil; seviye kavramı yok. Düğme yalnızca
        // seçimde gerçek görev varsa çıkar.
        onConvert={movableSelectedIds.length > 0 ? () => setConvertOpen(true) : undefined}
        onArchive={() => setConfirmingBulkAction("archive")}
        onDelete={() => setConfirmingBulkAction("delete")}
        lioTasks={selectedLioTasks(tasks, selection.selectedIds)}
        onSelectAll={() => selection.selectAll(tasks.map((g) => g.id))}
        onDeselectAll={selection.deselectAll}
        selectableCount={tasks.length}
      />
    </>
  );

  // Kaydırınca tepede beliren sabit şerit (bkz. App.tsx CoverStickyHeader).
  // Kapaklı detay sayfalarındaki desenin aynısı: burada "kapak" rolünü sayfanın
  // kendi başlık satırı üstleniyor — o satır yukarı kayınca filtreler ve
  // Sırala/Seç şeritte yeniden beliriyor, aksi halde uzun bir panoda aşağı
  // inildiğinde bu kontrollere hiç erişilemiyordu.
  usePageHeader(t("Yapılacaklar"), headerRef, []);
  usePageHeaderTabs(filterButtons, [filter, selection.selectionMode, sadeceGecikenler, gecikenIdleri.size], filtersRef);
  usePageHeaderActions(
    { right: sortAndSelect, sourceRef: toolbarRef },
    [sort, selection.selectionMode, selection.selectedIds.size, archiving, movableSelectedIds.length]
  );

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: "28px 28px 40px" }}>
      <header
        ref={headerRef}
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Yapılacaklar")}</h1>

        <div ref={filtersRef} style={{ marginLeft: 8 }}>
          {filterButtons}
        </div>

        {/* Sıralama ölçütü + toplu seçim. Filtrenin hemen yanında ama ayrı
            kontroller: filtre neyin görüneceğini, bunlar hangi düzende
            görüneceğini ve neye toplu işlem yapılacağını seçer. */}
        <div ref={toolbarRef} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {sortAndSelect}
        </div>
      </header>

      {/* Açıklama satırı seçim modunda gizlenir: kullanıcı o an kart işaretlemeye
          odaklanmış, satır yalnızca eylem çubuğunu aşağı itiyor. */}
      {!selection.selectionMode && (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 18px" }}>
          {sort !== "manual"
            ? t("Kartlar seçtiğin ölçüte göre sıralı; kendi sıranı düzenlemek için “Kendi sıram”a dön.")
            : filter === "assigned"
            ? t("Sana atanmış görevler. Buradaki sıralama yalnızca sana görünür.")
            : t("Kişisel görevlerini senden başkası görmez.")}
        </p>
      )}

      <YapilacakListeSekmeleri
        listeler={yapilacakListeleri.listeler}
        secili={seciliListe}
        onSec={(id) => {
          selection.clear();
          setSeciliListe(id);
        }}
        sayilar={Object.fromEntries([["", items.length], ...yapilacakListeleri.listeler.map((l) => [l.id, listedekiler(items, l.id).length])])}
        onOlustur={yapilacakListeleri.olustur}
        onAdlandir={yapilacakListeleri.adlandir}
        onSil={(id) => void yapilacakListeleri.sil(id).then(load)}
      />

      {/* Seçim modunda: seçilen kartları bir listeye koy ya da açık listeden çıkar. */}
      {selection.selectionMode && selection.selectedIds.size > 0 && (yapilacakListeleri.listeler.length > 0 || seciliListe) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "-6px 0 14px", fontSize: 13, color: c.textSecondary }}>
          <span>{t("Seçilenleri listeye ekle:")}</span>
          {yapilacakListeleri.listeler
            .filter((l) => l.id !== seciliListe)
            .map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={async () => {
                  const ogeler = Array.from(selection.selectedIds).flatMap((id) => {
                    const source = sourceById.get(id);
                    return source ? [{ source, itemId: id }] : [];
                  });
                  await yapilacakListeApi.ekle(l.id, ogeler).catch(() => undefined);
                  selection.clear();
                  load();
                }}
                style={{ padding: "4px 11px", borderRadius: 999, border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary, fontSize: 13 }}
              >
                {l.ad}
              </button>
            ))}
          {seciliListe && (
            <button
              type="button"
              onClick={async () => {
                const ogeler = Array.from(selection.selectedIds).flatMap((id) => {
                  const source = sourceById.get(id);
                  return source ? [{ source, itemId: id }] : [];
                });
                await yapilacakListeApi.cikar(seciliListe, ogeler).catch(() => undefined);
                selection.clear();
                load();
              }}
              style={{ padding: "4px 11px", borderRadius: 999, border: `1px solid ${c.border}`, background: "transparent", color: c.danger, fontSize: 13 }}
            >
              {t("Bu listeden çıkar")}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>
      ) : (
        // Masaüstünde üç sütun yan yana, dar ekranda alt alta — diğer kanbanlarla
        // aynı yerleşim (bkz. DepartmentTasksPanel).
        <div
          ref={boardScrollRef}
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
                onSetDeadline={handleSetDeadline}
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
                selectionMode={selection.selectionMode}
                selectedIds={selection.selectedIds}
                onToggleSelect={selection.toggleSelect}
                highlightTaskId={highlightTaskId}
                onOpenSource={openTaskSource}
                onCreateSubtask={handleCreateSubtask}
                canHaveSubtasks={canHaveSubtasks}
                onTasksReload={load}
              />
            </div>
          ))}
        </div>
      )}

      {/* Atanan kart gerçek görev düzenleyicisini açar — proje sayfasındakiyle
          birebir aynı ekran. Kişisel kartın düzenleyicisi aynı iskeleti taşır
          (bkz. PersonalTodoModal); farkı yalnızca kişisel görevde olmayan alanlar. */}
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
          // Pano projeden bağımsız: taşınan görev kullanıcıya atanmış kaldığı
          // sürece yine burada, yalnızca alt yazısı (proje adı) değişir.
          onMoved={() => {
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
          // Kişisel görev projeye/departmana atandı: aynı pencere bu kez gerçek
          // görevin düzenleyicisi olarak açılır (ekip, bütçe, dosyalar hemen
          // doldurulabilsin). Kart panoda "atanan" olarak kalıyor.
          onPromoted={(task) => {
            setEditingPersonal(null);
            setEditingTask(task);
            load();
          }}
        />
      )}

      {convertOpen && (
        <BulkConvertHierarchyModal
          // Yalnızca gerçek görevler: kişisel kartlar dönüştürülemez, listeye
          // girerlerse "atlandı" satırlarıyla kullanıcıyı yanıltırlardı.
          tasks={tasks.filter((task) => sourceById.get(task.id) === "assigned")}
          selectedIds={new Set(movableSelectedIds)}
          onClose={() => setConvertOpen(false)}
          onDone={() => {
            load();
            selection.clear();
            setConvertOpen(false);
          }}
        />
      )}

      {movingOpen && (
        <MoveTaskModal
          taskIds={movableSelectedIds}
          onClose={() => setMovingOpen(false)}
          onMoved={() => {
            setMovingOpen(false);
            selection.clear();
            load();
          }}
        />
      )}

      {confirmingBulkAction === "archive" && (
        <ConfirmDialog
          title={t("Görevleri arşivle")}
          message={t("{n} görevi arşive taşımak istediğine emin misin? Arşivlenen görevler bu listeden kalkar, arşivden geri getirilebilir.", { n: selection.selectedIds.size })}
          confirmLabel={t("Arşivle")}
          danger={false}
          onCancel={() => setConfirmingBulkAction(null)}
          onConfirm={handleArchiveSelected}
        />
      )}
      {confirmingBulkAction === "delete" && (
        <ConfirmDialog
          title={t("Görevleri sil")}
          message={t("{n} görevi silmek istediğine emin misin? Kişisel görevler arşivlenir ve istediğin zaman geri getirebilirsin; atanmış görevler birkaç saniye içinde Cmd/Ctrl+Z ile geri alınabilir, sonrasında kalıcı olarak silinir.", { n: selection.selectedIds.size })}
          confirmLabel={t("Sil")}
          danger
          onCancel={() => setConfirmingBulkAction(null)}
          onConfirm={handleDeleteSelected}
        />
      )}
    </div>
  );
}
