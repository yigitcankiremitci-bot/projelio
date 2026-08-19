import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Department, Task } from "@projelio/shared";
import { api } from "../api/client";
import DepartmentMembersList, { DepartmentMembersListHandle } from "../components/DepartmentMembersList";
import DepartmentModulesPanel from "../components/DepartmentModulesPanel";
import DepartmentTasksPanel, { DepartmentTasksPanelHandle } from "../components/DepartmentTasksPanel";
import DepartmentBudgetPanel, { DepartmentBudgetPanelHandle } from "../components/DepartmentBudgetPanel";
import DepartmentTabs, { DepartmentTab, visibleDepartmentTabs } from "../components/DepartmentTabs";
import ProductsPanel from "../components/ProductsPanel";
import FeedPanel, { FeedPanelHandle } from "../components/panels/FeedPanel";
import FilesPanel, { FilesPanelHandle } from "../components/FilesPanel";
import DepartmentSettingsModal from "../components/DepartmentSettingsModal";
import ProfileCard from "../components/ProfileCard";
import { getDepartmentCoverUrl } from "../lib/departmentCovers";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageHeader, usePageHeaderTabs } from "../lib/pageHeader";
import { colors } from "../theme/colors";
import { IconLayers, IconSettings } from "../components/icons";

// Bir departmanın kendi sayfası: iç dinamikler üstteki sekmelerle ayrılır —
// Sosyal (Twitter mantığında paylaşım/yorum/beğeni akışı), Görevler (doğrudan
// kanban — "Çıktılar" ara katmanı yok), Ekip (kadro), Bütçe (görev bütçesi
// onayları + otomatik hesaplanan özetler + genel gelir/gider defteri), Modüller
// (departmana özel etkinleştirilen araçlar). Bkz. ProjectDetail/ProjectTabs ile
// birebir aynı desen; sekmeler ?tab= sorgu parametresiyle tutulur.
export default function DepartmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = colors.light;
  const [department, setDepartment] = useState<Department | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  // Geçerli sekmeler kullanıcının yetkisine göre daralır: taşeron Bütçe ve Ekip
  // sekmelerini hiç görmez (bkz. DepartmentTabs.visibleDepartmentTabs). ?tab=budget
  // ile doğrudan gelinse bile aşağıdaki fallback devreye girer — sunucu da zaten
  // 403 döner, bu yalnızca boş ekran göstermemek için.
  const access = department?.viewerAccess;
  const validTabs: DepartmentTab[] = visibleDepartmentTabs(access).map((t) => t.key);
  // ?tab= yoksa departmanın kendi açılış tercihi kullanılır (ayarlardan
  // kişiselleştirilebilir); departman henüz yüklenmediyse "tasks" varsayılır.
  // Tercih edilen sekme kullanıcıya kapalıysa ilk açık sekmeye düşülür.
  const preferredTab: DepartmentTab = (department?.defaultTab as DepartmentTab) || "tasks";
  const defaultTab: DepartmentTab = validTabs.includes(preferredTab) ? preferredTab : validTabs[0] ?? "tasks";
  const activeTab: DepartmentTab = validTabs.includes(tabParam as DepartmentTab) ? (tabParam as DepartmentTab) : defaultTab;
  const setActiveTab = (next: DepartmentTab) => {
    setSearchParams(next === defaultTab ? {} : { tab: next }, { replace: true });
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const feedRef = useRef<FeedPanelHandle>(null);
  const teamRef = useRef<DepartmentMembersListHandle>(null);
  const tasksRef = useRef<DepartmentTasksPanelHandle>(null);
  const budgetRef = useRef<DepartmentBudgetPanelHandle>(null);
  const filesRef = useRef<FilesPanelHandle>(null);

  const reload = () => {
    if (!id) return;
    api.get<Department>(`/departments/${id}`).then(setDepartment).catch(() => setDepartment(null));
    api
      .get<Task[]>(`/departments/${id}/tasks`)
      .then(setTasks)
      .catch(() => setTasks([]));
  };

  useEffect(reload, [id]);

  useEffect(() => {
    if (department?.name) document.title = `${department.name} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [department?.name]);

  // Alt navigasyondaki "+" butonu, proje detayındaki (ProjectDetail) ile aynı desende:
  // departman detayında hangi sekmedeysek ona uygun eylemi tetikler. Ürün Yönetimi
  // departmanının "Modüller" sekmesi kendi "Ürün/Hizmet ekle" düğmesini kullanır (bkz.
  // ProductsPanel useFab=false); Dosyalar sekmesi dosya yükleme/oluşturma seçimini açar.
  useProjectFabAction(
    !department
      ? null
      : activeTab === "flow"
      ? { label: "Yeni paylaşım", onClick: () => feedRef.current?.openCreate() }
      : // Kadroya davet ve bütçeye kayıt: yalnızca yönetebilenler (org sahibi /
      // departman yöneticisi). Diğerlerinde "+" butonu hiç çıkmaz.
      activeTab === "team"
      ? access?.canManage === false
        ? null
        : { label: "Kişi davet et", onClick: () => teamRef.current?.openCreate() }
      : activeTab === "tasks"
      ? { label: "Görev ekle", onClick: () => tasksRef.current?.openCreate() }
      : activeTab === "budget"
      ? access?.canManage === false
        ? null
        : { label: "Kayıt ekle", onClick: () => budgetRef.current?.openCreate() }
      : activeTab === "files"
      ? {
          label: "Dosya ekle",
          options: [
            { label: "Dosya yükle", onClick: () => filesRef.current?.openUpload() },
            { label: "Yeni dosya oluştur", onClick: () => filesRef.current?.openCreateNative() },
          ],
        }
      : null,
    [activeTab, department?.id, access?.canManage]
  );

  // Kaydırınca tepede beliren sabit başlık için (bkz. App.tsx / lib/pageHeader).
  const coverRef = useRef<HTMLDivElement>(null);
  // Akıştaki geri bağlantısının DOM öğesi: şerittekiler ancak bu kaybolunca belirir.
  const backRef = useRef<HTMLDivElement>(null);
  usePageHeader(department?.name, coverRef, [department?.name, department?.organizationId], {
    to: department ? `/organizations/${department.organizationId}?tab=departments` : "/organizations",
    label: "Departmanlar",
    sourceRef: backRef,
  });
  // Kaydırılınca sabit başlığın en üst bandında da sekmeler görünsün diye
  // (bkz. ProjectDetail'deki aynı desen).
  // Akıştaki sekme çubuğunun DOM öğesi: sabit şerit ancak bu çubuk yukarı kayıp
  // gözden kaybolduktan sonra belirsin, yoksa sekmeler bir an iki kez görünür
  // (bkz. lib/pageHeader PageHeaderTabs.sourceRef).
  const tabsRef = useRef<HTMLDivElement>(null);

  usePageHeaderTabs(
    // Mobilde de kaydediliyor: orada sayfanın kendi sekme çubuğu kaydırınca
    // sabit şeridin altında kalıp erişilemez oluyordu (bkz. App.tsx).
    <DepartmentTabs
      active={activeTab}
      onChange={setActiveTab}
      access={access}
      style={{ marginBottom: 0 }}
      scrollable
    />,
    [activeTab, access],
    tabsRef
  );

  if (!id) return null;

  const isProductDepartment = department?.catalogKey === "urun_yonetimi";
  const coverUrl = department ? getDepartmentCoverUrl(department) : undefined;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <div
        ref={coverRef}
        style={{
          position: "relative",
          height: 320,
          background: coverUrl
            ? `linear-gradient(rgba(26,31,41,0.15), rgba(26,31,41,0.6)), center/cover url(${coverUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {/* Kişi kartı: diğer anasayfalarla aynı bileşen, kapak görselinin üstüne bindirilmiş —
            sağ üstteki kapak düzenleme ikonlarının altında, yer kaplamadan. */}
        <div style={{ position: "absolute", top: 76, right: 14, zIndex: 3 }}>
          <ProfileCard />
        </div>

        <div style={{ paddingRight: 90 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <IconLayers size={16} color="#fff" />
            <h1 style={{ fontSize: 20, fontWeight: 500, color: "#fff", margin: 0 }}>{department?.name ?? "…"}</h1>
          </div>
          {department?.description && (
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", margin: 0 }}>{department.description}</p>
          )}
        </div>

        {/* Ayarlar dişlisi yalnızca yönetebilenlere: taşeron/çalışan tıklasa 403 alırdı. */}
        {department && access?.canManage !== false && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Departman ayarları"
            title="Departman ayarları"
            style={{
              position: "absolute",
              bottom: 14,
              right: 14,
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: "none",
              background: "rgba(26,31,41,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconSettings size={15} color="#fff" />
          </button>
        )}
      </div>

      <div style={{ padding: "0 28px 28px" }}>
        <div ref={backRef}>
          <Link
            to={department ? `/organizations/${department.organizationId}?tab=departments` : "/organizations"}
            style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", margin: "14px 0" }}
          >
            ← Departmanlar
          </Link>
        </div>

        {department && (
          <>
            <div ref={tabsRef}>
              <DepartmentTabs active={activeTab} onChange={setActiveTab} access={access} />
            </div>

            {activeTab === "flow" && <FeedPanel ref={feedRef} departmentId={department.id} tasks={tasks} />}

            {activeTab === "team" && access?.canViewTeam !== false && (
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: 16 }}>
                <DepartmentMembersList ref={teamRef} departmentId={department.id} onChanged={reload} />
              </div>
            )}

            {activeTab === "tasks" && <DepartmentTasksPanel ref={tasksRef} departmentId={department.id} />}

            {/* Sekme zaten gizli; ?tab=budget ile doğrudan gelinirse de panel açılmasın. */}
            {activeTab === "budget" && access?.canViewBudget !== false && (
              <DepartmentBudgetPanel ref={budgetRef} departmentId={department.id} />
            )}

            {activeTab === "modules" && (
              <>
                <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: 16 }}>
                  <DepartmentModulesPanel
                    organizationId={department.organizationId}
                    departmentId={department.id}
                    departmentKey={department.catalogKey}
                  />
                </div>

                {isProductDepartment && (
                  <div style={{ marginTop: 20 }}>
                    <ProductsPanel organizationId={department.organizationId} departmentId={department.id} useFab={false} />
                  </div>
                )}
              </>
            )}

            {activeTab === "files" && <FilesPanel ref={filesRef} departmentId={department.id} />}
          </>
        )}
      </div>

      {settingsOpen && department && (
        <DepartmentSettingsModal
          department={department}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => {
            setDepartment(updated);
            setSettingsOpen(false);
          }}
          // Kapak değişimi anında kaydedilir: modal açık kalır, arkadaki başlık
          // yeni kapağı hemen gösterir.
          onCoverChanged={setDepartment}
          onDeleted={() => navigate(`/organizations/${department.organizationId}?tab=departments`)}
          onArchived={() => navigate(`/organizations/${department.organizationId}?tab=departments`)}
        />
      )}
    </div>
  );
}
