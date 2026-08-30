import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Job, Operation, Project, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import { useLiveRoom } from "../lib/liveRoom";
import ProjectCard from "../components/ProjectCard";
import OperationCard from "../components/OperationCard";
import CreateOperationModal from "../components/CreateOperationModal";
import EditJobModal from "../components/EditJobModal";
import JobTabs, { JobTab, visibleJobTabs } from "../components/JobTabs";
import { useCurrentUser, useIsSubcontractor } from "../lib/useCurrentUser";
import JobModulesPanel, { JobModulesPanelHandle } from "../components/JobModulesPanel";
import JobTeamPanel, { JobTeamPanelHandle } from "../components/JobTeamPanel";
import EntityCover, { CoverBackLink, coverActionButton } from "../components/EntityCover";
import { useCoverTheme } from "../theme/useCoverTheme";
import JobInviteBanner from "../components/JobInviteBanner";
import JobTasksPanel, { JobTasksPanelHandle } from "../components/JobTasksPanel";
import FilesPanel from "../components/FilesPanel";
import TodayCompletedPanel from "../components/TodayCompletedPanel";
import TaskEditModal from "../components/TaskEditModal";
import Modal from "../components/Modal";
import { useThemeColors } from "../theme/useThemeColors";
import { IconUser, IconCalendar, IconSettings } from "../components/icons";
import { useSortableList } from "../lib/useSortableList";
import { useLatestRef, useRefreshOnUndo, useReorderUndo, useUndo } from "../lib/undo";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageHeader, usePageHeaderTabs } from "../lib/pageHeader";
import { useIsDesktop } from "../lib/useIsDesktop";
import { pageGutter } from "../lib/layout";
import { CoverStats, StatSummary, type StatItem } from "../components/StatGrid";

export default function JobDetail() {
  const { id } = useParams();
  // Aynı sayfadaki kullanıcılar: canlı tazeleme + "kim burada" (bkz. lib/liveRoom.ts).
  useLiveRoom(id ? `job:${id}` : null);
  const navigate = useNavigate();
  const c = useThemeColors();
  const cover = useCoverTheme();
  const isDesktop = useIsDesktop();
  // Sayfanın yan boşluğu tek bir yerden: aşağıdaki negatif kenar boşluklu
  // şerit de bu değeri kullanmalı, yoksa dar ekranda hizalar kayar.
  const gutter = pageGutter(isDesktop);
  const [job, setJob] = useState<Job | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [creatingOperation, setCreatingOperation] = useState(false);
  const [endedOpen, setEndedOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState(false);
  // Sekme, URL'deki ?tab= ile eşleşir: sidebar'daki ağaçtan "Ekip" ya da "Dosyalar"
  // gibi bir alt bağlantıya tıklandığında doğrudan o sekmeyle açılsın diye.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  // Taşeron işi görür ama Ekip ve Modüller sekmelerini görmez; ?tab= ile
  // doğrudan gelinse bile Projeler'e düşer (sunucu da 403 döner).
  const isSubcontractor = useIsSubcontractor();
  // İş başlığını/detaylarını yalnızca işi KURAN kişi değiştirebilir; sunucu da
  // aynı kuralı uyguluyor (JobsService.assertOwner). Ekip üyesi ve taşeron için
  // dişli hiç render edilmez.
  const { user: currentUser } = useCurrentUser();
  const validTabs: JobTab[] = visibleJobTabs(isSubcontractor).map((t) => t.key);
  const activeTab: JobTab = validTabs.includes(tabParam as JobTab) ? (tabParam as JobTab) : "projects";
  const setActiveTab = (next: JobTab) => {
    setSearchParams(next === "projects" ? {} : { tab: next }, { replace: true });
  };
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentCompletePrompt, setParentCompletePrompt] = useState<Task | null>(null);
  const [currentUserActiveTaskId, setCurrentUserActiveTaskId] = useState<string | undefined>(undefined);
  const gridRef = useRef<HTMLDivElement>(null);
  const registerReorderUndo = useReorderUndo();
  const { pushUndo } = useUndo();
  const projectsRef = useLatestRef(projects);
  const tasksRef = useLatestRef(tasks);
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const tasksPanelRef = useRef<JobTasksPanelHandle>(null);
  const teamRef = useRef<JobTeamPanelHandle>(null);
  const modulesRef = useRef<JobModulesPanelHandle>(null);

  // Sekmeye göre alt navigasyondaki "+" butonunun ne yapacağı.
  //
  // Panellerin kendi başlıklarındaki ekleme düğmeleri (İşe al / Modül ekle /
  // Dosya yükle…) kaldırıldı: her sekmenin ekleme eylemi tek ve aynı yerde,
  // "+" düğmesinde toplanıyor. Panel yalnızca tetikleyici metodu dışa açıyor;
  // kaydı SAYFA yapıyor, çünkü useProjectFabAction sayfa başına tek yerden
  // çağrılmalı (bkz. lib/projectFab.ts).
  useProjectFabAction(
    activeTab === "tasks"
      ? { label: "Görev ekle", onClick: () => tasksPanelRef.current?.openCreate() }
      : activeTab === "programs"
      ? { label: "Yeni rutin", onClick: () => setCreatingOperation(true) }
      : activeTab === "team"
      ? { label: "İşe al", onClick: () => teamRef.current?.openHire() }
      : activeTab === "modules"
      ? { label: "Modül ekle", onClick: () => modulesRef.current?.openAdd() }
      : // Dosyalar sekmesinin "+" eylemini FilesPanel'in kendisi kaydediyor
        // (bkz. components/FilesPanel.tsx) — seçenekler bağlı buluta göre
        // değiştiği için o bilgi yalnızca panelin içinde var.
        null,
    [activeTab]
  );

  const reload = () => {
    if (!id) return;
    api.get<Job>(`/jobs/${id}`).then(setJob).catch(() => setJob(null));
    api.get<Project[]>(`/jobs/${id}/projects`).then(setProjects).catch(() => setProjects([]));
    api.get<Operation[]>(`/jobs/${id}/operations`).then(setOperations).catch(() => setOperations([]));
  };

  useEffect(reload, [id]);
  // Geri/ileri alma sunucu durumunu değiştirir; sayfa kendini tazelemeli.
  useRefreshOnUndo(reload);

  // Canlı görünüm: başka bir ekip üyesi yeni proje eklediğinde/değiştirdiğinde sayfayı
  // yenilemeye gerek kalmadan görünsün diye proje listesi kısa aralıklarla tazelenir.
  // Gerçekten bir değişiklik yoksa state güncellenmez (gereksiz render/görev yüklemesi olmaz).
  useEffect(() => {
    if (!id) return;
    const fingerprint = (list: Project[]) =>
      JSON.stringify(list.map((p) => [p.id, p.title, p.status, p.sortOrder, p.coverImageUrl, p.deadline]));
    const timer = setInterval(() => {
      api
        .get<Project[]>(`/jobs/${id}/projects`)
        .then((fresh) => {
          setProjects((prev) => (fingerprint(prev) === fingerprint(fresh) ? prev : fresh));
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [id]);

  // Tarayıcı sekmesinin başlığında her koşulda "Projelio" yerine işin adı yazsın.
  useEffect(() => {
    if (job?.title) document.title = `${job.title} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [job?.title]);

  // İşe ait tüm projelerin görev (ve alt görev) sayısını toplamak için
  // her projenin görev listesini çekip birleştiriyoruz.
  const reloadTasks = () => {
    if (projects.length === 0) {
      setTasks([]);
      return;
    }
    Promise.all(
      projects.map((p) => api.get<Task[]>(`/projects/${p.id}/tasks`).catch(() => [] as Task[]))
    ).then((lists) => setTasks(lists.flat()));
  };

  useEffect(reloadTasks, [projects]);

  useEffect(() => {
    api
      .get<{ id: string; activeTaskId?: string } | null>("/auth/me")
      .then((me) => setCurrentUserActiveTaskId(me?.activeTaskId))
      .catch(() => setCurrentUserActiveTaskId(undefined));
  }, []);

  const handleToggleActive = (taskId: string) => {
    const turningOn = currentUserActiveTaskId !== taskId;
    setCurrentUserActiveTaskId(turningOn ? taskId : undefined);
    api.patch(`/tasks/${taskId}/active-worker`, { active: turningOn }).catch(() => {
      setCurrentUserActiveTaskId((prev) => (turningOn ? undefined : prev));
    });
  };

  const updateTaskInState = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const removeTaskFromState = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId && t.parentTaskId !== taskId));
  };

  // Toplu arşivleme/silme (bkz. JobTasksPanel > TaskSelectionBar) yalnızca
  // kullanıcının doğrudan seçtiği üst seviye id'leri döndürür — alt görevler
  // sunucuda kendiliğinden kapsandığı için burada da `removeTaskFromState` ile
  // aynı mantıkla (id VEYA parentTaskId eşleşiyorsa) listeden düşürülürler.
  const removeTasksFromState = (ids: string[]) => {
    const idSet = new Set(ids);
    setTasks((prev) => prev.filter((t) => !idSet.has(t.id) && !(t.parentTaskId && idSet.has(t.parentTaskId))));
  };

  // Alt görev oluşturmayı Cmd/Ctrl+Z ile geri alınabilir yapar (bkz.
  // ProjectDetail.tsx registerTaskCreateUndo — aynı desen).
  const registerTaskCreateUndo = (task: Task, payload: Record<string, unknown>) => {
    if (!task.projectId) return;
    let currentId = task.id;
    pushUndo({
      label: "Görev oluşturma",
      run: async () => {
        await api.delete(`/tasks/${currentId}`);
        reloadTasks();
      },
      redo: async () => {
        const recreated = await api.post<Task>(`/projects/${task.projectId}/tasks`, payload);
        currentId = recreated.id;
        reloadTasks();
      },
    });
  };

  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    const parent = tasks.find((t) => t.id === parentTaskId);
    if (!parent) return;
    const payload = { title, status: parent.status, deadline: parent.deadline, parentTaskId };
    try {
      const created = await api.post<Task>(`/projects/${parent.projectId}/tasks`, payload);
      setTasks((prev) => [...prev, created]);
      registerTaskCreateUndo(created, payload);
    } catch {
      // alt görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleMoveTask = (taskId: string, status: TaskStatus, registerUndo = true) => {
    const previousStatus = tasksRef.current.find((t) => t.id === taskId)?.status;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    api
      .patch(`/tasks/${taskId}/status`, { status })
      // Tamamlanma zamanı/kişisi sunucuda hesaplanıyor ("Bugün yapılanlar" için);
      // gerçek değeri almak üzere görevleri yeniden çekiyoruz.
      .then(() => reloadTasks())
      .catch(() => reloadTasks());
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

  useSortableList(
    gridRef,
    {
      onEnd: () => {
        const el = gridRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        const previousIds = projectsRef.current.map((p) => p.id);
        setProjects((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          return ids.map((pid) => byId.get(pid)!).filter(Boolean);
        });
        api.patch("/projects/reorder", { ids }).catch(() => reload());
        registerReorderUndo("/projects/reorder", previousIds, ids, reload);
      },
    },
    [projects.length === 0, activeTab]
  );

  // Kaydırınca tepede beliren sabit başlık için (bkz. App.tsx / lib/pageHeader).
  const coverRef = useRef<HTMLDivElement>(null);
  // Akıştaki geri bağlantısının DOM öğesi: şerittekiler ancak bu kaybolunca belirir.
  const backRef = useRef<HTMLDivElement>(null);
  usePageHeader(job?.title, coverRef, [job?.title], { to: "/", label: "İşler", sourceRef: backRef });
  // Kaydırılınca sabit başlığın en üst bandında da sekmeler görünsün diye
  // (bkz. ProjectDetail'deki aynı desen).
  // Akıştaki sekme çubuğunun DOM öğesi: sabit şerit ancak bu çubuk yukarı kayıp
  // gözden kaybolduktan sonra belirsin, yoksa sekmeler bir an iki kez görünür
  // (bkz. lib/pageHeader PageHeaderTabs.sourceRef).
  const tabsRef = useRef<HTMLDivElement>(null);

  usePageHeaderTabs(
    // Mobilde de kaydediliyor: orada sayfanın kendi sekme çubuğu kaydırınca
    // sabit şeridin altında kalıp erişilemez oluyordu (bkz. App.tsx).
    <JobTabs
      active={activeTab}
      onChange={setActiveTab}
      isSubcontractor={isSubcontractor}
      style={{ marginBottom: 0 }}
      scrollable
    />,
    [activeTab, isSubcontractor],
    tabsRef
  );

  if (!id) return null;

  const activeProjects = projects.filter((p) => p.status === "active");
  const activeOperations = operations.filter((o) => o.status === "active");
  // Kapatılan rutinler silinmiyor, yalnızca aktiflerin arasından çıkarılıyor:
  // geçmiş kayıtlarına ve eklerine erişim gerekiyor (bkz. 060).
  const endedOperations = operations.filter((o) => o.status === "ended");
  const pendingTasksCount = tasks.filter((t) => t.status !== "completed").length;
  const completedTasksCount = tasks.filter((t) => t.status === "completed").length;

  // Tek dizi, iki yerleşim: geniş ekranda kapağın içinde, dar ekranda akışta
  // (bkz. StatGrid — hangisinin çizileceğine bileşenler karar veriyor).
  const stats: StatItem[] = [
    { label: "Proje", value: activeProjects.length },
    { label: "Rutin", value: activeOperations.length },
    { label: "Bekleyen", value: pendingTasksCount },
    { label: "Biten", value: completedTasksCount },
  ];

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <EntityCover
        coverRef={coverRef}
        back={
          <div ref={backRef}>
            <CoverBackLink to="/" label="İşler" />
          </div>
        }
        coverImageUrl={job?.coverImageUrl}
        seed={job?.id}
        // Masaüstünde 330 idi; özet kapağın içine girince o boşluk zaten doldu
        // ve fazlası sayfayı aşağı itiyordu. Dar ekran tavanı EntityCover'da.
        height={260}
        title={job?.title ?? "…"}
        lioSubject={job ? { kind: "is", title: job.title, id: job.id } : undefined}
        description={job?.description}
        meta={
          job && (
            <>
              {job.ownerName && (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <IconUser size={12} color={cover.secondary} />
                  {job.ownerName}
                </span>
              )}
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconCalendar size={12} color={cover.secondary} />
                {new Date(job.createdAt).toLocaleDateString("tr-TR")} kuruldu
              </span>
            </>
          )
        }
        stats={<CoverStats items={stats} />}
        action={
          job && currentUser?.id === job.ownerId ? (
            <button
              onClick={() => setEditing(true)}
              aria-label="İşi düzenle"
              style={coverActionButton(c)}
            >
              <IconSettings size={20} color={c.textSecondary} />
            </button>
          ) : undefined
        }
      />

      {/* Kapağın hemen altı: geri bağlantısı artık kapağın içinde olduğu için
          sekme çubuğu yukarı çekildi (bkz. CoverBackLink). */}
      <div style={{ padding: `8px ${gutter}px 28px` }}>
        {/* Bildirimdeki davetten gelindiyse kararı burada da verebilsin; bekleyen
            davet yoksa bileşen hiçbir şey çizmez. */}
        <JobInviteBanner jobId={id} />

        {/* Bu çubuk eskiden position:sticky idi; ama kaydırınca beliren üst şerit
            (zIndex 34) onun üstüne bindiği için sekmeler ekranda duruyor gözükmesine
            rağmen görünmez oluyordu. Artık normal akışta kalıp yukarı kayıyor ve
            yerini şeritteki kopyası alıyor (bkz. usePageHeaderTabs, App.tsx). */}
        <div
          style={{
            background: c.background,
            margin: `0 -${gutter}px`,
            padding: `0 ${gutter}px 8px`,
          }}
        >
          <div ref={tabsRef}>
            {/* marginBottom 0: sekmelerle proje kartları arasındaki boşluk
                şeridin alt dolgusundan (8px) ibaret kalsın. */}
            <JobTabs
              active={activeTab}
              onChange={setActiveTab}
              isSubcontractor={isSubcontractor}
              style={{ marginBottom: 0 }}
            />
          </div>
        </div>

        <div>
          <StatSummary items={stats} />

          {activeTab === "projects" && (
            projects.length === 0 ? (
              <div
                style={{
                  border: `1px dashed ${c.border}`,
                  borderRadius: 12,
                  padding: 40,
                  textAlign: "center",
                  color: c.textSecondary,
                  fontSize: 16,
                }}
              >
                Bu işte henüz proje yok.
              </div>
            ) : (
              <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {projects.map((p) => (
                  <div key={p.id} data-id={p.id}>
                    <ProjectCard
                      project={p}
                      // Sunucudaki kuralın aynısı: proje sahibi ya da işin sahibi.
                      canManage={Boolean(currentUser && (currentUser.id === p.ownerId || currentUser.id === job?.ownerId))}
                      onStatusChanged={(updated) =>
                        setProjects((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                      }
                    />
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === "programs" && (
            operations.length === 0 ? (
              <div
                style={{
                  border: `1px dashed ${c.border}`,
                  borderRadius: 12,
                  padding: 40,
                  textAlign: "center",
                  color: c.textSecondary,
                  fontSize: 16,
                  lineHeight: 1.6,
                }}
              >
                Bu işte henüz rutin yok.
                <br />
                <span style={{ fontSize: 14 }}>
                  Rutin, bitişi olmayan ve tekrarlayan işler içindir — aylık bakım, haftalık
                  raporlama, sosyal medya yönetimi gibi. Bitişi olan işler proje olarak açılır.
                </span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {/* Kapatılmış rutinler artık ayrı bir bölümde (aşağıda) — burada
                    yalnızca çalışan ve duraklatılmış olanlar durur, aksi halde
                    kapanmış onlarca rutin aktiflerin arasında kayboluyordu. */}
                {operations
                  .filter((o) => o.status !== "ended")
                  .map((o) => (
                  <OperationCard key={o.id} operation={o} />
                ))}
              </div>
            )
          )}

          {/* ---- Kapatılmış rutinler ----
              Kapatılan bir rutin listeden düşmez, buraya iner: tekrar geçmişi ve
              eklenmiş link/dosyalar hâlâ okunabilir olmalı. Varsayılan kapalı;
              zamanla birikeceği için aktiflerin dikkatini dağıtmasın. */}
          {activeTab === "programs" && endedOperations.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <button
                type="button"
                onClick={() => setEndedOpen((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 17,
                  fontWeight: 500,
                  color: c.textPrimary,
                }}
              >
                Kapatılmış rutinler
                <span style={{ fontSize: 13, color: c.textSecondary, fontWeight: 400 }}>
                  {endedOperations.length} rutin · {endedOpen ? "gizle" : "göster"}
                </span>
              </button>

              {endedOpen && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 14,
                    marginTop: 12,
                    // Kapanmış oldukları görsel olarak da belli olsun.
                    opacity: 0.72,
                  }}
                >
                  {endedOperations.map((o) => (
                    <OperationCard key={o.id} operation={o} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "team" && (
            <JobTeamPanel
              ref={teamRef}
              jobId={id}
              jobTitle={job?.title}
              tasks={tasks}
              projects={projects}
              ownerId={job?.ownerId}
              onTasksReload={reloadTasks}
            />
          )}

          {activeTab === "files" && (
            <FilesPanel jobId={id} />
          )}

          {/* Modüller işin içinde de görünür: anasayfadan atanan modüle
              ulaşmak için kullanıcıyı anasayfaya geri göndermek gerekmiyor. */}
          {activeTab === "modules" && id && <JobModulesPanel ref={modulesRef} jobId={id} />}

          {/* "Bugün yapılanlar" görev listesinin başında: bugün neyin bittiği,
              sıradaki işe bakarken anlam taşıyor — proje kartlarının üstünde
              değil. */}
          {activeTab === "tasks" && <TodayCompletedPanel tasks={tasks} />}

          {activeTab === "tasks" && (
            <JobTasksPanel
              ref={tasksPanelRef}
              jobId={id}
              jobTitle={job?.title}
              projects={projects}
              tasks={tasks}
              onCreateSubtask={handleCreateSubtask}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              onTaskRenamed={updateTaskInState}
              onTasksReload={reloadTasks}
              activeTaskId={currentUserActiveTaskId}
              onToggleActive={handleToggleActive}
              onTasksArchived={removeTasksFromState}
              onTasksDeleted={removeTasksFromState}
            />
          )}
        </div>
      </div>

      {creatingOperation && (
        <CreateOperationModal
          jobId={id}
          onClose={() => setCreatingOperation(false)}
          onCreated={(created) => {
            setOperations((prev) => [...prev, created]);
            // Yeni rutin açılır açılmaz alt kural tanımlanabilsin diye detayına gidilir.
            navigate(`/operations/${created.id}`);
          }}
        />
      )}

      {editing && job && (
        <EditJobModal
          job={job}
          onClose={() => setEditing(false)}
          onSaved={reload}
          onDeleted={() => navigate("/")}
          onArchived={() => navigate("/")}
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
              data-primary
              onClick={() => {
                handleToggleComplete(parentCompletePrompt.id);
                setParentCompletePrompt(null);
              }}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 16, fontWeight: 500 }}
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
          // Ek eklendiğinde modal kapanmadan kart güncellensin (rozet).
          onTaskPatched={updateTaskInState}
          onSaved={(updated) => {
            updateTaskInState(updated);
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

