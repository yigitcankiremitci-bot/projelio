import { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconListCheck, IconSettings, IconPlus, IconFolder } from "./icons";
import CreateJobModal from "./CreateJobModal";
import CreateProjectModal from "./CreateProjectModal";
import CreateTaskModal from "./CreateTaskModal";
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
  const [modal, setModal] = useState<"job" | "project" | "task" | null>(null);
  const [choosing, setChoosing] = useState(false);
  const { action: fabAction } = useContext(ProjectFabContext);

  const isActive = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));

  // Sayfaya göre "+" butonunun ne oluşturacağını belirle: ana sayfada iş,
  // bir işin içindeyken (o an aktif sekme kendi eylemini kaydetmediyse) proje veya
  // görev seçimi. Bir işin ya da projenin içinde aktif olan sekme (İşler/Ekip/Çıktılar/
  // Akış/Bütçe/Süreç) ProjectFabContext üzerinden kendi eylemini kaydedebilir; kayıtlıysa
  // "+" butonu öncelikle onu tetikler.
  const jobMatch = location.pathname.match(/^\/jobs\/([^/]+)/);
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);

  let createAction: "job" | "job-choice" | "custom" | null = null;
  let jobId: string | null = null;

  if (location.pathname === "/") {
    createAction = "job";
  } else if ((jobMatch || projectMatch) && fabAction) {
    createAction = "custom";
  } else if (jobMatch) {
    createAction = "job-choice";
    jobId = jobMatch[1];
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
                transform: `translate(-50%, -50%) rotate(${choosing ? 45 : 0}deg)`,
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: c.accent,
                border: `3px solid ${c.surface}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "transform 0.15s ease",
              }}
            >
              <IconPlus size={28} color={c.primaryDark} />
            </button>
          )}

          {choosing && jobId && (
            <div
              style={{
                position: "absolute",
                bottom: 70,
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

      {choosing && (
        <div
          onClick={() => setChoosing(false)}
          style={{ position: "fixed", inset: 0, zIndex: 29 }}
        />
      )}

      {modal === "job" && <CreateJobModal onClose={() => setModal(null)} />}
      {modal === "project" && jobId && (
        <CreateProjectModal jobId={jobId} onClose={() => setModal(null)} />
      )}
      {modal === "task" && jobId && (
        <CreateTaskModal jobId={jobId} onClose={() => setModal(null)} />
      )}
    </>
  );
}
