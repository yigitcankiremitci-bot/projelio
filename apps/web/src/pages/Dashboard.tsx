import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Job, Project } from "@projelio/shared";
import { api } from "../api/client";
import JobCard from "../components/JobCard";
import { colors } from "../theme/colors";
import { useSortableList } from "../lib/useSortableList";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useNavVisibility } from "../lib/useNavVisibility";
import { IconBuilding, IconLayers, IconChevronRight, IconFolder, IconActivity } from "../components/icons";
import ProfileCard from "../components/ProfileCard";
import BudgetPanel from "../components/BudgetPanel";

type DashboardTab = "jobs" | "budget";

const tabs: { key: DashboardTab; label: string; icon: typeof IconFolder }[] = [
  { key: "jobs", label: "İşler", icon: IconFolder },
  { key: "budget", label: "Bütçe", icon: IconActivity },
];

export default function Dashboard() {
  const [tab, setTab] = useState<DashboardTab>("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const c = colors.light;
  const gridRef = useRef<HTMLDivElement>(null);
  // Masaüstünde sol sidebar'da zaten Organizasyonlar/Gruplar linkleri var;
  // bu kısayol satırı sadece sidebar'ın kaybolduğu mobil görünümde gösterilir.
  const isDesktop = useIsDesktop();
  // Kısayollar da nav ile aynı kuralı izler: yalnızca erişilebilir en az bir
  // organizasyon/grup varsa gösterilir.
  const { showOrganizations, showGroups } = useNavVisibility();

  const reloadJobs = () => {
    api.get<Job[]>("/jobs").then(setJobs).catch(() => setJobs([]));
  };

  useEffect(() => {
    reloadJobs();
    api.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
  }, []);

  useSortableList(
    gridRef,
    {
      onEnd: () => {
        const el = gridRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        setJobs((prev) => {
          const byId = new Map(prev.map((j) => [j.id, j]));
          return ids.map((id) => byId.get(id)!).filter(Boolean);
        });
        api.patch("/jobs/reorder", { ids }).catch(() => reloadJobs());
      },
    },
    // Sekme değişince ızgara DOM'dan kalkıp geri geldiği için yeniden bağlanmalı.
    [jobs.length === 0, tab]
  );

  const projectCountByJob = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.jobId] = (acc[p.jobId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>
          {tab === "jobs" ? "İşlerim" : "Bütçem"}
        </h1>
        <ProfileCard />
      </div>

      {/* İşler / Bütçe sekmeleri */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${c.border}` }}>
        {tabs.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 14px",
                border: "none",
                background: "transparent",
                color: isActive ? c.textPrimary : c.textSecondary,
                fontSize: 15,
                fontWeight: 500,
                borderBottom: `2px solid ${isActive ? c.accent : "transparent"}`,
                marginBottom: -1,
              }}
            >
              <t.icon size={15} color={isActive ? c.accentDark : c.textSecondary} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "budget" && <BudgetPanel />}

      {tab === "jobs" && !isDesktop && (showOrganizations || showGroups) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          {showOrganizations && (
            <Link
              to="/organizations"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <IconBuilding size={17} color={c.textSecondary} />
              <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>Organizasyonlar</span>
              <IconChevronRight size={14} color={c.textSecondary} />
            </Link>
          )}
          {showGroups && (
            <Link
              to="/groups"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <IconLayers size={17} color={c.textSecondary} />
              <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>Gruplar</span>
              <IconChevronRight size={14} color={c.textSecondary} />
            </Link>
          )}
        </div>
      )}

      {tab === "jobs" &&
        (jobs.length === 0 ? (
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
            Henüz iş yok.
          </div>
        ) : (
          <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {jobs.map((j) => (
              <div key={j.id} data-id={j.id}>
                {/* Sunucudan gelen gerçek proje sayısı öncelikli; yoksa eski yönteme düş */}
                <JobCard job={j} projectCount={j.projectCount ?? projectCountByJob[j.id] ?? 0} />
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
