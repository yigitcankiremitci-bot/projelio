import { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconListCheck, IconSettings, IconPlus } from "./icons";
import CreateJobModal from "./CreateJobModal";
import CreateProjectModal from "./CreateProjectModal";
import { ProjectFabContext } from "../lib/projectFab";

const leftItems = [
  { to: "/", label: "Ana sayfa", icon: IconDashboard },
  { to: "/calendar", label: "Takvim", icon: IconCalendar },
];

const rightItems = [
  { to: "/tasks", label: "Yapılacaklar", icon: IconListCheck },
  { to: "/settings", label: "Ayarlar", icon: IconSettings },
];

export default function BottomNav() {
  const c = colors.light;
  const location = useLocation();
  const [modal, setModal] = useState<"job" | "project" | null>(null);
  const { action: fabAction } = useContext(ProjectFabContext);

  const isActive = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));

  // Sayfaya göre "+" butonunun ne oluşturacağını belirle: ana sayfada iş,
  // bir işin içindeyken proje. Bir projenin içindeyken ise o an aktif olan
  // sekme (Çıktılar/Akış/Ekip/Bütçe/Süreç) ProjectFabContext üzerinden kendi
  // eylemini kaydeder ve "+" butonu onu tetikler.
  const jobMatch = location.pathname.match(/^\/jobs\/([^/]+)/);
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);

  let createAction: "job" | "project" | "custom" | null = null;
  let jobId: string | null = null;

  if (location.pathname === "/") {
    createAction = "job";
  } else if (jobMatch) {
    createAction = "project";
    jobId = jobMatch[1];
  } else if (projectMatch && fabAction) {
    createAction = "custom";
  }

  const handleFabClick = () => {
    if (createAction === "custom") {
      fabAction?.onClick();
    } else if (createAction) {
      setModal(createAction);
    }
  };

  return (
    <>
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 58,
          background: c.surface,
          borderTop: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
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
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0" }}
            >
              <Icon size={20} color={active ? c.accentDark : c.textSecondary} />
              <span style={{ fontSize: 13, color: active ? c.accentDark : c.textSecondary, fontWeight: active ? 500 : 400 }}>
                {item.label}
              </span>
            </Link>
          );
        })}

        <div style={{ position: "relative", width: 60, height: "100%", flexShrink: 0 }}>
          {createAction && (
            <button
              onClick={handleFabClick}
              aria-label={createAction === "custom" ? fabAction?.label ?? "Oluştur" : "Oluştur"}
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: c.accent,
                border: `3px solid ${c.surface}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconPlus size={28} color={c.primaryDark} />
            </button>
          )}
        </div>

        {rightItems.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0" }}
            >
              <Icon size={20} color={active ? c.accentDark : c.textSecondary} />
              <span style={{ fontSize: 13, color: active ? c.accentDark : c.textSecondary, fontWeight: active ? 500 : 400 }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {modal === "job" && <CreateJobModal onClose={() => setModal(null)} />}
      {modal === "project" && jobId && (
        <CreateProjectModal jobId={jobId} onClose={() => setModal(null)} />
      )}
    </>
  );
}
