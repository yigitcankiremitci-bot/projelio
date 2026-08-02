import { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconListCheck, IconSettings, IconPlus, IconFolder, IconBuilding, IconActivity } from "./icons";
import CreateJobModal from "./CreateJobModal";
import CreateProjectModal from "./CreateProjectModal";
import CreateOperationModal from "./CreateOperationModal";
import CreateTaskModal from "./CreateTaskModal";
import CreateOrganizationModal from "./CreateOrganizationModal";
import CreateGroupModal from "./CreateGroupModal";
import { ProjectFabContext } from "../lib/projectFab";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useNavVisibility } from "../lib/useNavVisibility";
import { SIDEBAR_WIDTH } from "../lib/layout";

const rightItems = [
  { to: "/calendar", label: "Takvim", icon: IconCalendar },
  { to: "/tasks", label: "Yapılacaklar", icon: IconListCheck },
  { to: "/settings", label: "Ayarlar", icon: IconSettings },
];

type ModalKind = "job" | "project" | "operation" | "task" | "organization" | "group" | "organization-in-group";

export default function BottomNav() {
  const c = colors.light;
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [choosing, setChoosing] = useState(false);
  const { action: fabAction } = useContext(ProjectFabContext);
  // Gruplar artık alt menüde ayrı bir sekme değil: mobilde ana sayfadaki
  // kısayoldan erişiliyor (bkz. Dashboard.tsx), burada yalnızca Organizasyon kalır.
  const { showOrganizations } = useNavVisibility();

  const leftItems = [
    { to: "/", label: "Ana sayfa", icon: IconDashboard },
    ...(showOrganizations ? [{ to: "/organizations", label: "Organizasyon", icon: IconBuilding }] : []),
  ];

  const isActive = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));

  // Sayfaya göre "+" butonunun ne oluşturacağını belirle: ana sayfada iş, bir işin
  // içindeyken (o an aktif sekme kendi eylemini kaydetmediyse) proje veya görev seçimi,
  // Organizasyonlar/Gruplar sayfalarında ilgili kaydı, bir grubun detayındayken o gruba
  // bağlı yeni bir organizasyon. Bir işin ya da projenin içinde aktif olan sekme
  // ProjectFabContext üzerinden kendi eylemini kaydedebilir; kayıtlıysa "+" butonu
  // öncelikle onu tetikler.
  const jobMatch = location.pathname.match(/^\/jobs\/([^/]+)/);
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const operationMatch = location.pathname.match(/^\/operations\/([^/]+)/);
  const groupDetailMatch = location.pathname.match(/^\/groups\/([^/]+)$/);

  let createAction: "job" | "job-choice" | "custom" | ModalKind | null = null;
  let jobId: string | null = null;
  let groupIdForOrg: string | null = null;
  let fabLabel = "Oluştur";

  if ((jobMatch || projectMatch || operationMatch) && fabAction) {
    createAction = "custom";
    fabLabel = fabAction.label;
  } else if (jobMatch) {
    createAction = "job-choice";
    jobId = jobMatch[1];
    fabLabel = "Proje, program veya görev ekle";
  } else if (location.pathname === "/organizations") {
    createAction = "organization";
    fabLabel = "Yeni organizasyon";
  } else if (location.pathname === "/groups") {
    createAction = "group";
    fabLabel = "Yeni grup";
  } else if (groupDetailMatch) {
    createAction = "organization-in-group";
    groupIdForOrg = groupDetailMatch[1];
    fabLabel = "Bu gruba organizasyon ekle";
  } else {
    // "+" düğmesi diğer tüm sayfalarda da (ana sayfa, takvim, yapılacaklar, ayarlar)
    // görünür ve yeni iş oluşturur.
    createAction = "job";
    fabLabel = "Yeni iş";
  }

  const handleFabClick = () => {
    if (createAction === "custom") {
      fabAction?.onClick();
    } else if (createAction === "job-choice") {
      setChoosing((prev) => !prev);
    } else if (createAction) {
      setModal(createAction);
    }
  };

  const fabButton = (
    <button
      onClick={handleFabClick}
      aria-label={fabLabel}
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        border: `3px solid ${c.surface}`,
        background: c.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.15s ease",
        transform: `rotate(${choosing ? 45 : 0}deg)`,
        boxShadow: "0 4px 14px rgba(26,31,41,0.22)",
      }}
    >
      <IconPlus size={28} color={c.primaryDark} />
    </button>
  );

  const choosingMenu = choosing && jobId && (
    <div
      style={{
        position: "absolute",
        bottom: 74,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 8,
        boxShadow: "0 4px 16px rgba(26,31,41,0.18)",
        zIndex: 31,
      }}
    >
      <button
        onClick={() => {
          setChoosing(false);
          setModal("project");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: c.textPrimary,
          fontSize: 15,
          whiteSpace: "nowrap",
        }}
      >
        <IconFolder size={15} color={c.textSecondary} />
        Yeni proje
      </button>
      {/* Program: süresi olmayan, tekrarlayan işlerden oluşan çalışma. */}
      <button
        onClick={() => {
          setChoosing(false);
          setModal("operation");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: c.textPrimary,
          fontSize: 15,
          whiteSpace: "nowrap",
        }}
      >
        <IconActivity size={15} color={c.textSecondary} />
        Yeni program
      </button>
      <button
        onClick={() => {
          setChoosing(false);
          setModal("task");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: c.textPrimary,
          fontSize: 15,
          whiteSpace: "nowrap",
        }}
      >
        <IconListCheck size={15} color={c.textSecondary} />
        Yeni görev
      </button>
    </div>
  );

  const modals = (
    <>
      {modal === "job" && <CreateJobModal onClose={() => setModal(null)} />}
      {modal === "project" && jobId && <CreateProjectModal jobId={jobId} onClose={() => setModal(null)} />}
      {modal === "operation" && jobId && <CreateOperationModal jobId={jobId} onClose={() => setModal(null)} />}
      {modal === "task" && jobId && <CreateTaskModal jobId={jobId} onClose={() => setModal(null)} />}
      {modal === "organization" && <CreateOrganizationModal onClose={() => setModal(null)} />}
      {modal === "group" && <CreateGroupModal onClose={() => setModal(null)} />}
      {modal === "organization-in-group" && groupIdForOrg && (
        <CreateOrganizationModal fixedGroupId={groupIdForOrg} onClose={() => setModal(null)} />
      )}
    </>
  );

  if (isDesktop) {
    // Masaüstünde sol tarafta sidebar zaten tüm navigasyonu sağlıyor; burada sadece
    // "+" oluşturma butonu, sayfanın içerik alanının altında ortalanmış şekilde kalır.
    return (
      <>
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: `calc(50% + ${SIDEBAR_WIDTH / 2}px)`,
            transform: "translateX(-50%)",
            zIndex: 32,
          }}
        >
          {choosingMenu}
          {createAction && fabButton}
        </div>

        {choosing && <div onClick={() => setChoosing(false)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />}

        {modals}
      </>
    );
  }

  return (
    <>
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          // Safe-area (çentikli telefonlar) yüksekliğe eklenir. Yükseklik ve üst padding,
          // simge + etiketin bara sığması ve üstten taşmaması için 58px'ten 68px'e çıkarıldı.
          height: "calc(68px + env(safe-area-inset-bottom))",
          background: c.surface,
          borderTop: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "flex-start",
          padding: "0 4px",
          paddingBottom: "env(safe-area-inset-bottom)",
          zIndex: 30,
        }}
      >
        {leftItems.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 2px 6px", minWidth: 0 }}
            >
              <Icon size={18} color={active ? c.accentDark : c.textSecondary} />
              <span
                style={{
                  fontSize: 11,
                  color: active ? c.accentDark : c.textSecondary,
                  fontWeight: active ? 500 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        <div style={{ position: "relative", width: 60, height: "100%", flexShrink: 0 }}>
          {createAction && (
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translate(-50%, -50%)" }}>{fabButton}</div>
          )}
          {choosingMenu}
        </div>

        {rightItems.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 2px 6px", minWidth: 0 }}
            >
              <Icon size={18} color={active ? c.accentDark : c.textSecondary} />
              <span
                style={{
                  fontSize: 11,
                  color: active ? c.accentDark : c.textSecondary,
                  fontWeight: active ? 500 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {choosing && <div onClick={() => setChoosing(false)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />}

      {modals}
    </>
  );
}
