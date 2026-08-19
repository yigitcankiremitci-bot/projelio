import { useEffect, useRef, useState } from "react";
import { COVER_TEXT_VEIL, COVER_VEIL_HEIGHT, coverBackground, coverText } from "../lib/covers";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import type { Project, ProjectMember, ProjectStatus, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import EditProjectModal from "../components/EditProjectModal";
import ExtendDeadlineModal from "../components/ExtendDeadlineModal";
import TaskEditModal from "../components/TaskEditModal";
import Modal from "../components/Modal";
import ProjectTabs, { ProjectTab, visibleProjectTabs } from "../components/ProjectTabs";
import FeedPanel, { FeedPanelHandle } from "../components/panels/FeedPanel";
import TeamPanel, { TeamPanelHandle } from "../components/panels/TeamPanel";
import BudgetPanel, { BudgetPanelHandle } from "../components/panels/BudgetPanel";
import OutputsPanel, { OutputsPanelHandle } from "../components/OutputsPanel";
import FilesPanel, { FilesPanelHandle } from "../components/FilesPanel";
import ProcessPanel, { ProcessNavState, ViewMode, computeInitialProcessNavDates } from "../components/panels/ProcessPanel";
import { colors } from "../theme/colors";
import { IconSettings } from "../components/icons";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageHeader, usePageHeaderTabs } from "../lib/pageHeader";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useLatestRef, useRefreshOnUndo, useReorderUndo, useUndo } from "../lib/undo";
import { useIsSubcontractor } from "../lib/useCurrentUser";

export default function ProjectDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const { pushUndo } = useUndo();
  const registerReorderUndo = useReorderUndo();
  const tasksRef = useLatestRef(tasks);
  const [editing, setEditing] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentCompletePrompt, setParentCompletePrompt] = useState<Task | null>(null);
  // Taşeron: bütçe ve ekip yüzeyleri hiç açılmaz (bkz. lib/useCurrentUser).
  const isSubcontractor = useIsSubcontractor();
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  // Bütçe sekmesi görünürlüğü. Belirsizken (henüz yüklenmedi) true: sekmenin
  // sonradan belirip çubuğu kaydırmasındansa, yetkisizde bir an görünüp
  // kaybolması daha az rahatsız edici — asıl kısıt zaten sunucuda.
  const [canViewBudget, setCanViewBudget] = useState(true);

  // Sekme bileşen state'inde DEĞİL, URL'de (?tab=) tutulur — departman ve
  // organizasyon sayfalarındaki desenin aynısı. State olduğunda üç sorun vardı:
  // sidebar'dan başka bir projeye geçilince React aynı bileşeni yeniden
  // kullandığı için sekme taşınıyordu (Bütçe'deyken açılan yeni proje de
  // Bütçe'de açılıyordu), sekme paylaşılabilir bir adres üretmiyordu ve tarayıcı
  // geri tuşu sekme geçişlerini hiç bilmiyordu.
  //
  // Geçerli sekme listesi yetkiye göre daralır; ?tab=budget ile doğrudan gelinse
  // bile yetki yoksa Görev/Çıktı'ya düşer (asıl kısıt zaten sunucuda).
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const validTabs: ProjectTab[] = visibleProjectTabs(canViewBudget, isSubcontractor).map((t) => t.key);
  const activeTab: ProjectTab = validTabs.includes(tabParam as ProjectTab) ? (tabParam as ProjectTab) : "tasks";
  const setActiveTab = (next: ProjectTab) => {
    setSearchParams(next === "tasks" ? {} : { tab: next }, { replace: true });
  };
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);
  const [extendingDeadline, setExtendingDeadline] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | undefined>(undefined);
  const c = colors.light;
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const outputsRef = useRef<OutputsPanelHandle>(null);
  const feedRef = useRef<FeedPanelHandle>(null);
  const teamRef = useRef<TeamPanelHandle>(null);
  const budgetRef = useRef<BudgetPanelHandle>(null);
  const filesRef = useRef<FilesPanelHandle>(null);

  // Alt navigasyondaki "+" butonu, proje detayında hangi sekmedeysek ona uygun eylemi
  // tetiklesin diye ProjectFabContext üzerinden kayıt yapılır (sekme değiştikçe güncellenir).
  useProjectFabAction(
    !project || !id
      ? null
      : activeTab === "tasks"
      ? {
          // Sekme hem görev hem çıktı barındırıyor; "+" hangisini eklediğini
          // sormalı (bkz. BottomNav'daki seçim menüsü deseni).
          label: "Görev veya çıktı ekle",
          options: [
            { label: "Yeni görev", onClick: () => outputsRef.current?.openCreateTask() },
            { label: "Yeni çıktı", onClick: () => outputsRef.current?.openCreateOutput() },
          ],
        }
      : activeTab === "feed"
      ? { label: "Yeni paylaşım", onClick: () => feedRef.current?.openCreate() }
      : activeTab === "team"
      ? { label: "Üye ekle", onClick: () => teamRef.current?.openCreate() }
      : activeTab === "budget"
      ? { label: "Ödeme / gider ekle", onClick: () => budgetRef.current?.openCreate() }
      : activeTab === "files"
      ? {
          label: "Dosya ekle",
          options: [
            { label: "Dosya yükle", onClick: () => filesRef.current?.openUpload() },
            { label: "Yeni dosya oluştur", onClick: () => filesRef.current?.openCreateNative() },
          ],
        }
      : { label: "Deadline'ı değiştir", onClick: () => setExtendingDeadline(true) },
    [activeTab, project, id]
  );

  // Süreç sekmesinin gün/hafta/ay/yıl gezinme durumu burada tutulur ki sekme değiştirince kaybolmasın.
  const [processViewMode, setProcessViewMode] = useState<ViewMode>("week");
  const [processSelectedDay, setProcessSelectedDay] = useState<Date>(new Date());
  const [processViewingDay, setProcessViewingDay] = useState<Date>(new Date());
  const [processSelectedWeek, setProcessSelectedWeek] = useState<number | null>(null);
  const [processViewingWeek, setProcessViewingWeek] = useState<number>(1);
  const [processSelectedMonth, setProcessSelectedMonth] = useState<number | null>(null);
  const [processViewingMonth, setProcessViewingMonth] = useState<number>(1);
  const [processSelectedYear, setProcessSelectedYear] = useState<number | null>(null);
  const processNavInitialized = useRef(false);

  const processNav: ProcessNavState = {
    viewMode: processViewMode,
    setViewMode: setProcessViewMode,
    selectedDay: processSelectedDay,
    setSelectedDay: setProcessSelectedDay,
    viewingDay: processViewingDay,
    setViewingDay: setProcessViewingDay,
    selectedWeek: processSelectedWeek,
    setSelectedWeek: setProcessSelectedWeek,
    viewingWeek: processViewingWeek,
    setViewingWeek: setProcessViewingWeek,
    selectedMonth: processSelectedMonth,
    setSelectedMonth: setProcessSelectedMonth,
    viewingMonth: processViewingMonth,
    setViewingMonth: setProcessViewingMonth,
    selectedYear: processSelectedYear,
    setSelectedYear: setProcessSelectedYear,
  };

  const reloadAll = () => {
    if (!id) return;
    api.get<Project>(`/projects/${id}`).then(setProject).catch(() => setProject(null));
    api.get<Task[]>(`/projects/${id}/tasks`).then(setTasks).catch(() => setTasks([]));
  };

  useEffect(reloadAll, [id]);
  // Geri/ileri alma sunucu durumunu değiştirir (ör. silinen görev geri gelir);
  // sayfa kendini tazelemeli, yoksa ancak yenileyince görünür.
  useRefreshOnUndo(reloadAll);

  // Tarayıcı sekmesinin başlığında proje adı yazsın.
  useEffect(() => {
    if (project?.title) document.title = `${project.title} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [project?.title]);

  // Proje ilk yüklendiğinde Süreç gezinmesini bugüne/bu haftaya/bu aya sabitlenmiş makul varsayılanlarla başlat (yalnızca bir kez).
  useEffect(() => {
    if (!project || processNavInitialized.current) return;
    processNavInitialized.current = true;
    const defaults = computeInitialProcessNavDates(project);
    setProcessViewingWeek(defaults.viewingWeek);
    setProcessSelectedWeek(defaults.selectedWeek);
    setProcessViewingMonth(defaults.viewingMonth);
    setProcessSelectedMonth(defaults.selectedMonth);
    setProcessSelectedYear(defaults.selectedYear);
    setProcessSelectedDay(defaults.selectedDay);
    setProcessViewingDay(defaults.viewingDay);
  }, [project]);

  useEffect(() => {
    api
      .get<{ id: string; activeTaskId?: string } | null>("/auth/me")
      .then((me) => {
        setCurrentUserId(me?.id);
        setActiveTaskId(me?.activeTaskId);
      })
      .catch(() => setCurrentUserId(undefined));
  }, []);

  // Proje bütçesi hassas: sunucu yalnızca proje/iş sahibine ve "bütçeyi görebilir"
  // izni açık onaylı üyelere açıyor (bkz. BudgetService.assertCanViewBudget).
  // Taşeron bu iznin kapalı hâliyle eklenir; sekmeyi ona hiç göstermiyoruz ki
  // tıklayıp 403 ile karşılaşmasın.
  useEffect(() => {
    if (!id || !currentUserId || !project) return;
    if (currentUserId === project.ownerId) {
      setCanViewBudget(true);
      return;
    }
    api
      .get<ProjectMember[]>(`/projects/${id}/members`)
      .then((members) => {
        const mine = members.find((m) => m.userId === currentUserId);
        setCanViewBudget(!!mine?.canViewBudget);
      })
      // Ekip listesini bile göremiyorsa bütçeyi hiç göremez.
      .catch(() => setCanViewBudget(false));
  }, [id, currentUserId, project?.ownerId]);

  // Not: "yetki cevabı geç geldi, sekme kapandı" ve "başka projeye geçilince
  // sekme sıfırlansın" durumları için ayrı efektler vardı; ikisi de artık
  // gereksiz — sekme URL'den türetildiği için geçersiz ?tab= kendiliğinden
  // "tasks"a düşüyor ve başka projeye giden bağlantıda ?tab= zaten yok.

  // İş ekibi sekmesinden bir göreve tıklanıp buraya yönlendirildiğinde, "Çıktılar"
  // sekmesine geçip ilgili görevi vurgulamak için location.state üzerinden gelen
  // hedefi okuyoruz. location.key her navigasyonda değiştiği için aynı göreve
  // tekrar tıklanırsa da yeniden tetiklenir.
  useEffect(() => {
    const targetId = (location.state as { highlightTaskId?: string } | null)?.highlightTaskId;
    if (!targetId) return;
    setActiveTab("tasks");
    setHighlightTaskId(targetId);
    // Hedef bir kez tüketildikten sonra history state'ini temizle: aksi halde sayfa
    // yenilenince ya da başka bir işlem sonrası aynı hedefe tekrar "ışınlanma" oluyordu.
    window.history.replaceState({}, "");
    // Parlama animasyonu bittikten sonra vurgusunu kaldır ki kalıcı kalmasın.
    const timer = setTimeout(() => setHighlightTaskId(undefined), 3500);
    return () => clearTimeout(timer);
  }, [location.key]);

  // Başlıktaki durum rozetinden anında değiştirilir; "Kaydet" beklemez, çünkü
  // tek alanlık bir değişiklik için düzenleme kutusunu açtırmak (bkz. rozetin
  // kartlardaki hâli) gereksiz bir adım.
  const handleStatusChange = async (status: ProjectStatus) => {
    if (!id) return;
    const updated = await api.patch<Project>(`/projects/${id}`, { status }).catch(() => null);
    if (updated) setProject(updated);
  };

  const handleToggleActive = (taskId: string) => {
    const turningOn = activeTaskId !== taskId;
    setActiveTaskId(turningOn ? taskId : undefined);
    api.patch(`/tasks/${taskId}/active-worker`, { active: turningOn }).catch(() => {
      setActiveTaskId((prev) => (turningOn ? undefined : prev));
    });
  };

  const updateTask = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const removeTaskFromState = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId && t.parentTaskId !== taskId));
  };

  // Çoğaltılan görevler bu projeye eklenir; taşınanlar (başka bir proje/departmana
  // gittiği için) bu projenin görünümünden kalkar (bkz. TaskSelectionBar/MoveTaskModal).
  const handleTasksDuplicated = (created: Task[]) => {
    setTasks((prev) => [...prev, ...created]);
  };

  const handleTasksMoved = (moved: Task[]) => {
    const movedIds = new Set(moved.map((t) => t.id));
    setTasks((prev) => prev.filter((t) => !movedIds.has(t.id)));
  };

  // Toplu arşivleme/silme (bkz. TaskSelectionBar) yalnızca kullanıcının doğrudan
  // seçtiği üst seviye id'leri döndürür — alt görevler sunucuda kendiliğinden
  // kapsandığı için burada da `removeTaskFromState` ile aynı mantıkla (id VEYA
  // parentTaskId eşleşiyorsa) listeden düşürülürler.
  const removeTasksFromState = (ids: string[]) => {
    const idSet = new Set(ids);
    setTasks((prev) => prev.filter((t) => !idSet.has(t.id) && !(t.parentTaskId && idSet.has(t.parentTaskId))));
  };

  // Görev/alt görev oluşturmayı Cmd/Ctrl+Z ile geri alınabilir yapar: "run" az
  // önce oluşan kaydı siler, "redo" aynı bilgilerle yeniden oluşturur. Redo her
  // seferinde YENİ bir id ürettiği için (silinen kayıt kalıcı gitti), bir sonraki
  // undo'nun doğru id'yi silebilmesi için bu id'yi bir kapanış değişkeninde
  // güncel tutuyoruz.
  const registerTaskCreateUndo = (createdId: string, payload: Record<string, unknown>) => {
    let currentId = createdId;
    pushUndo({
      label: "Görev oluşturma",
      run: async () => {
        await api.delete(`/tasks/${currentId}`);
        reloadTasks();
      },
      redo: async () => {
        const recreated = await api.post<Task>(`/projects/${id}/tasks`, payload);
        currentId = recreated.id;
        reloadTasks();
      },
    });
  };

  const handleCreateTask = async (
    status: TaskStatus,
    title: string,
    options?: { weekNumber?: number; deadline?: string; startDate?: string; outputId?: string }
  ) => {
    if (!id) return;
    const deadline = options?.deadline ?? project?.deadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const payload = {
      title,
      status,
      deadline,
      startDate: options?.startDate,
      weekNumber: options?.weekNumber,
      outputId: options?.outputId,
    };
    try {
      const created = await api.post<Task>(`/projects/${id}/tasks`, payload);
      setTasks((prev) => [...prev, created]);
      registerTaskCreateUndo(created.id, payload);
    } catch {
      // görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    if (!id) return;
    const parent = tasks.find((t) => t.id === parentTaskId);
    if (!parent) return;
    const payload = { title, status: parent.status, deadline: parent.deadline, parentTaskId };
    try {
      const created = await api.post<Task>(`/projects/${id}/tasks`, payload);
      setTasks((prev) => [...prev, created]);
      registerTaskCreateUndo(created.id, payload);
    } catch {
      // alt görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const reloadTasks = () => {
    if (id) api.get<Task[]>(`/projects/${id}/tasks`).then(setTasks).catch(() => {});
  };

  const handleMoveTask = (taskId: string, status: TaskStatus, registerUndo = true) => {
    const previousStatus = tasksRef.current.find((t) => t.id === taskId)?.status;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    api.patch(`/tasks/${taskId}/status`, { status }).catch(reloadTasks);
    // registerUndo=false: bu çağrı başka bir işlemin yan etkisi (örn. üst görev
    // tamamlanınca alt görevlerin de kapanması) — yığında ayrı adım olmamalı.
    if (registerUndo && previousStatus && previousStatus !== status) {
      pushUndo({
        label: "Görev durumu",
        run: async () => {
          await api.patch(`/tasks/${taskId}/status`, { status: previousStatus });
          reloadTasks();
        },
        redo: async () => {
          await api.patch(`/tasks/${taskId}/status`, { status });
          reloadTasks();
        },
      });
    }
  };

  const handleReorderTasks = (ids: string[]) => {
    if (!ids.length) return;
    // Geri alma için yalnızca bu sürüklemeden etkilenen görevlerin eski sırası.
    const affectedIds = new Set(ids);
    const previousIds = tasksRef.current.filter((t) => affectedIds.has(t.id)).map((t) => t.id);
    setTasks((prev) => {
      const order = new Map(ids.map((taskId, index) => [taskId, index]));
      const affected = prev.filter((t) => order.has(t.id));
      const untouched = prev.filter((t) => !order.has(t.id));
      affected.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      return [...untouched, ...affected];
    });
    api.patch("/tasks/reorder", { ids }).catch(reloadTasks);
    registerReorderUndo("/tasks/reorder", previousIds, ids, reloadTasks);
  };

  const handleToggleComplete = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === "completed") {
      const previous = previousStatusRef.current[taskId] ?? "todo";
      delete previousStatusRef.current[taskId];
      handleMoveTask(taskId, previous);

      if (task.parentTaskId) {
        const parent = tasks.find((p) => p.id === task.parentTaskId);
        if (parent && parent.status === "completed") {
          // Yan etki: geri alma yığınında ayrı bir adım olmasın.
          handleMoveTask(parent.id, "in_progress", false);
        }
      }
    } else {
      previousStatusRef.current[taskId] = task.status;
      handleMoveTask(taskId, "completed");
      tasks
        .filter((t) => t.parentTaskId === taskId && t.status !== "completed")
        .forEach((sub) => {
          previousStatusRef.current[sub.id] = sub.status;
          handleMoveTask(sub.id, "completed", false);
        });

      if (task.parentTaskId) {
        const parent = tasks.find((p) => p.id === task.parentTaskId);
        if (parent && parent.status !== "completed") {
          const siblings = tasks.filter((t) => t.parentTaskId === parent.id);
          const allDone = siblings.every((s) => s.id === taskId || s.status === "completed");
          if (allDone) setParentCompletePrompt(parent);
        }
      }
    }
  };

  // Kaydırınca tepede beliren sabit başlık için (bkz. App.tsx / lib/pageHeader).
  const coverRef = useRef<HTMLDivElement>(null);
  // Akıştaki geri bağlantısının DOM öğesi: şerittekiler ancak bu kaybolunca belirir.
  const backRef = useRef<HTMLDivElement>(null);
  usePageHeader(project?.title, coverRef, [project?.title, project?.jobId], {
    to: project ? `/jobs/${project.jobId}` : "/",
    label: "Projeler",
    sourceRef: backRef,
  });
  const isDesktop = useIsDesktop();
  // Kaydırılınca sabit şeritte de sekmeler görünsün diye (bkz. lib/pageHeader
  // usePageHeaderTabs, App.tsx). Mobilde de kaydediliyor: orada sayfanın kendi
  // sekme çubuğu şeridin altında kalıp erişilemez oluyordu.
  // Akıştaki sekme çubuğunun DOM öğesi: şeritteki kopya ancak bu çubuk yukarı
  // kayıp gözden kaybolduktan sonra belirsin, yoksa sekmeler bir an iki kez
  // görünür (bkz. lib/pageHeader PageHeaderTabs.sourceRef).
  const tabsRef = useRef<HTMLDivElement>(null);

  usePageHeaderTabs(
    <ProjectTabs
      active={activeTab}
      onChange={setActiveTab}
      showBudget={canViewBudget}
      isSubcontractor={isSubcontractor}
      style={{ marginBottom: 0 }}
      scrollable
    />,
    [activeTab, canViewBudget, isSubcontractor],
    tabsRef
  );

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      {!project && (
        <div style={{ padding: 28 }}>
          <Link to="/" style={{ fontSize: 15, color: c.textSecondary, marginBottom: 4, display: "inline-block" }}>
            ← Projeler
          </Link>
        </div>
      )}

      {project && (() => {
        const hasCover = Boolean(project.coverImageUrl);
        return (
          <div
            ref={coverRef}
            style={{
              position: "relative",
              background: hasCover ? coverBackground(project.coverImageUrl) : c.surface,
              overflow: hasCover ? "hidden" : undefined,
              borderBottom: hasCover ? "none" : `1px solid ${c.border}`,
              // Kapak yokken içerik bloğun ÜSTÜNDEN başlıyor ve sol üstte yüzen
              // logo/sidebar oku ile sağ üstteki bildirim çanı (hepsi
              // position:fixed) proje adının üstüne biniyordu. O bandın yüksekliği
              // kadar (68px + pay) tepeden boşluk bırakılıyor. Kapak varsa içerik
              // zaten alta yaslı olduğu için gerekmiyor.
              padding: hasCover ? "20px 28px" : "76px 28px 18px",
              minHeight: hasCover ? 330 : undefined,
              display: hasCover ? "flex" : undefined,
              flexDirection: hasCover ? "column" : undefined,
              justifyContent: hasCover ? "flex-end" : undefined,
            }}
          >
            {hasCover && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: COVER_VEIL_HEIGHT,
                  background: COVER_TEXT_VEIL,
                  pointerEvents: "none",
                }}
              />
            )}

            {/* paddingRight kaldırıldı: sağ üstteki çan/tur düğmelerine yer açmak
                içindi, artık bloğun tepesindeki boşluk (ya da kapaklı hâlde alta
                yaslı düzen) o işi görüyor — burada daralmak başlığı erken kırıyordu. */}
            <div style={{ position: "relative", marginBottom: project.description ? 8 : 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{project.title}</h1>
                <StatusBadge
                  status={project.status}
                  onChange={currentUserId === project.ownerId ? handleStatusChange : undefined}
                />
              </div>
            </div>

            {project.description && (
              <p
                style={{
                  position: "relative",
                  fontSize: 16,
                  color: hasCover ? coverText.secondary : c.textSecondary,
                  margin: "0 0 14px",
                }}
              >
                {project.description}
              </p>
            )}

            {/* Ayar düğmesi mutlak konumdan çıkarılıp bu satırın kardeşi yapıldı: eskiden
                kapağın sağ altına sabitlendiği için ayırma çizgisinin üstüne biniyor,
                mobilde alt satıra kayan "Bitiş" yazısını da örtüyordu. Artık meta
                bilgilerle aynı satırda, dikeyde onlarla ortalanmış duruyor. */}
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderTop: hasCover ? "1px solid rgba(26,31,41,0.2)" : `1px solid ${c.border}`,
                paddingTop: 12,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  columnGap: isDesktop ? 24 : 12,
                  rowGap: 6,
                  // Mobilde yazı ekran genişliğiyle ölçekleniyor ki iki tarih tek satıra sığsın.
                  fontSize: isDesktop ? 15 : "clamp(11px, 3.2vw, 13px)",
                  color: hasCover ? coverText.secondary : c.textSecondary,
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>
                  Ücret: <span style={{ color: c.accentDark, fontWeight: 500 }}>{project.totalBudget.toLocaleString("tr-TR")} ₺</span>
                </span>
                {/* Başlangıç ve bitiş tek blok: satır kırılırsa birlikte iner, asla
                    birbirinden ayrılıp alt alta düşmez. */}
                <div style={{ display: "flex", columnGap: isDesktop ? 24 : 12, whiteSpace: "nowrap" }}>
                  <span>Başlangıç: {new Date(project.startDate).toLocaleDateString("tr-TR")}</span>
                  <span>Bitiş: {new Date(project.deadline).toLocaleDateString("tr-TR")}</span>
                </div>
              </div>

              {/* Düzenleme yalnızca proje sahibine görünür; sunucu tarafı da ayrıca yetki kontrolü yapar. */}
              {/* Proje başlığını/detaylarını yalnızca projeyi KURAN kişi (ya da işin
                  sahibi — sunucu tarafında ProjectsService.assertCanManage) değiştirir.
                  Kimlik henüz yüklenmediyse düğme gizli: "yüklenirken göster" hâli
                  taşerona bir an için düzenleme sunuyordu. */}
              {currentUserId && currentUserId === project.ownerId && (
                <button
                  onClick={() => setEditing(true)}
                  aria-label="Projeyi düzenle"
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: hasCover ? `1px solid rgba(26,31,41,0.2)` : `1px solid ${c.border}`,
                    background: hasCover ? "rgba(255,255,255,0.7)" : c.surface,
                    boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
                  }}
                >
                  <IconSettings size={17} color={c.textSecondary} />
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {project && id && (
        <div style={{ padding: "0 28px 28px" }}>
          {/* Bu çubuk eskiden position:sticky idi; ama kaydırınca beliren üst şerit
              (zIndex 34) onun üstüne bindiği için sekmeler ekranda duruyor gözükmesine
              rağmen görünmez oluyordu. Artık normal akışta kalıp yukarı kayıyor ve
              yerini şeritteki kopyası alıyor (bkz. usePageHeaderTabs, App.tsx). */}
          <div
            style={{
              background: c.background,
              margin: "0 -28px",
              padding: "10px 28px 8px",
            }}
          >
            <div ref={backRef}>
              <Link
                to={`/jobs/${project.jobId}`}
                style={{ fontSize: 14, color: c.textSecondary, display: "inline-block", marginBottom: 6 }}
              >
                ← Projeler
              </Link>
            </div>
            <div ref={tabsRef}>
              <ProjectTabs
                active={activeTab}
                onChange={setActiveTab}
                showBudget={canViewBudget}
                isSubcontractor={isSubcontractor}
              />
            </div>
          </div>

          {activeTab === "feed" && <FeedPanel ref={feedRef} projectId={id} tasks={tasks} />}
          {activeTab === "team" && (
            <TeamPanel ref={teamRef} projectId={id} tasks={tasks} ownerId={project.ownerId} onTaskUpdated={updateTask} />
          )}
          {activeTab === "tasks" && (
            <OutputsPanel
              ref={outputsRef}
              projectId={id}
              tasks={tasks}
              onCreateTask={handleCreateTask}
              onCreateSubtask={handleCreateSubtask}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              onTaskRenamed={updateTask}
              onReorderTasks={handleReorderTasks}
              activeTaskId={activeTaskId}
              onToggleActive={handleToggleActive}
              highlightTaskId={highlightTaskId}
              onTasksDuplicated={handleTasksDuplicated}
              onTasksMoved={handleTasksMoved}
              onTasksArchived={removeTasksFromState}
              onTasksDeleted={removeTasksFromState}
            />
          )}
          {activeTab === "budget" && canViewBudget && (
            <BudgetPanel
              ref={budgetRef}
              project={project}
              tasks={tasks}
              projectId={id}
              currentUserId={currentUserId}
              isOwner={currentUserId === project.ownerId}
              onTaskUpdated={updateTask}
            />
          )}
          {activeTab === "files" && <FilesPanel ref={filesRef} projectId={id} />}
          {activeTab === "process" && (
            <ProcessPanel
              project={project}
              tasks={tasks}
              onCreateTask={handleCreateTask}
              onCreateSubtask={handleCreateSubtask}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              onTaskRenamed={updateTask}
              nav={processNav}
              activeTaskId={activeTaskId}
              onToggleActive={handleToggleActive}
              onTasksDuplicated={handleTasksDuplicated}
              onTasksMoved={handleTasksMoved}
              onTasksArchived={removeTasksFromState}
              onTasksDeleted={removeTasksFromState}
            />
          )}
        </div>
      )}

      {editing && project && <EditProjectModal project={project} onClose={() => setEditing(false)} />}

      {extendingDeadline && project && (
        <ExtendDeadlineModal
          project={project}
          onClose={() => setExtendingDeadline(false)}
          onSaved={(updated) => {
            setProject(updated);
            setExtendingDeadline(false);
          }}
        />
      )}

      {parentCompletePrompt && (
        <Modal title="Görevi tamamla" onClose={() => setParentCompletePrompt(null)}>
          <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
            <strong style={{ color: c.textPrimary, fontWeight: 500 }}>{parentCompletePrompt.title}</strong> görevinin tüm alt
            görevleri tamamlandı. Bu görevi de tamamlandı olarak işaretlemek ister misin?
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setParentCompletePrompt(null)}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 16 }}
            >
              Hayır
            </button>
            <button
              onClick={() => {
                handleToggleComplete(parentCompletePrompt.id);
                setParentCompletePrompt(null);
              }}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 16, fontWeight: 500 }}
            >
              Evet, tamamla
            </button>
          </div>
        </Modal>
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={(updated) => {
            updateTask(updated);
            setEditingTask(null);
          }}
          onDeleted={(deletedTaskId) => {
            removeTaskFromState(deletedTaskId);
            setEditingTask(null);
          }}
          onArchived={(archivedTaskId) => {
            removeTaskFromState(archivedTaskId);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}
