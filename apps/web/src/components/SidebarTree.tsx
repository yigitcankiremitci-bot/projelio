import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Job } from "@projelio/shared";
import { colors } from "../theme/colors";
import { useSidebarHierarchy, SidebarGroupNode, SidebarOrgNode } from "../lib/useSidebarHierarchy";
import { IconBuilding, IconLayers, IconFolder, IconChevronRight, IconChevronDown } from "./icons";

type IconComp = typeof IconBuilding;

// İş düğümünün altında her zaman gösterilen sabit kısayollar — JobTabs'taki
// sekmelerin karşılığı. Veriye bağlı değildir (bir işin henüz projesi olmasa
// bile "Projeler" kısayolu görünür, tıklayınca boş listeyi gösterir).
const JOB_LEAF_TABS: { tab: string; label: string }[] = [
  { tab: "projects", label: "Projeler" },
  { tab: "programs", label: "Programlar" },
  { tab: "team", label: "Ekip" },
  { tab: "files", label: "Dosyalar" },
];

const INACTIVE_ICON = "#9AA6B4";
const INACTIVE_TEXT = "#C7CCD6";

/**
 * Sol menüdeki Grup > Organizasyon > İş > (Projeler/Programlar/Ekip/Dosyalar)
 * gezinme ağacı. Yalnızca gerçekten var olan seviyeler gösterilir — grubu ya da
 * organizasyonu olmayan bir kullanıcı için hiçbir şey render etmez.
 */
export default function SidebarTree() {
  const location = useLocation();
  const { groups, standaloneOrgs, standaloneJobs, loading } = useSidebarHierarchy();
  // "Gruplar" ve "Organizasyonlar" kategori başlıkları, eski düz linklerin yerini
  // aldığı için varsayılan olarak açık başlar (kullanıcı eskisi gibi listeyi hemen
  // görsün); tekil grup/organizasyon/iş düğümleri ise varsayılan kapalı.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["cat:groups", "cat:orgs"]));

  // Kullanıcı derinlerdeyken (bir işin/organizasyonun/grubun içindeyken) o yolu
  // otomatik aç — elle açılmış diğer dalları kapatmadan, sadece ekler.
  useEffect(() => {
    const jobMatch = location.pathname.match(/^\/jobs\/([^/]+)/);
    const orgMatch = location.pathname.match(/^\/organizations\/([^/]+)/);
    const groupMatch = location.pathname.match(/^\/groups\/([^/]+)/);
    if (!jobMatch && !orgMatch && !groupMatch) return;

    const allJobs: Job[] = [
      ...groups.flatMap((g) => [...g.orgs.flatMap((o) => o.jobs), ...g.jobs]),
      ...standaloneOrgs.flatMap((o) => o.jobs),
      ...standaloneJobs,
    ];

    setExpanded((prev) => {
      const next = new Set(prev);
      if (jobMatch) {
        const job = allJobs.find((j) => j.id === jobMatch[1]);
        next.add(`job:${jobMatch[1]}`);
        if (job?.organizationId) {
          next.add(`org:${job.organizationId}`);
          const parentGroup = groups.find((g) => g.orgs.some((o) => o.org.id === job.organizationId));
          if (parentGroup) {
            next.add(`group:${parentGroup.group.id}`);
            next.add("cat:groups");
          } else {
            next.add("cat:orgs");
          }
        } else if (job?.groupId) {
          next.add(`group:${job.groupId}`);
          next.add("cat:groups");
        }
      }
      if (orgMatch) {
        next.add(`org:${orgMatch[1]}`);
        const parentGroup = groups.find((g) => g.orgs.some((o) => o.org.id === orgMatch[1]));
        if (parentGroup) {
          next.add(`group:${parentGroup.group.id}`);
          next.add("cat:groups");
        } else {
          next.add("cat:orgs");
        }
      }
      if (groupMatch) {
        next.add(`group:${groupMatch[1]}`);
        next.add("cat:groups");
      }
      return next;
    });
    // groups/standaloneOrgs/standaloneJobs referansları her fetch'te değişir;
    // burada yalnızca rota değiştiğinde tetiklenmesi yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (loading) return null;
  if (groups.length === 0 && standaloneOrgs.length === 0 && standaloneJobs.length === 0) return null;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const searchTab = new URLSearchParams(location.search).get("tab");

  const renderJob = (job: Job, depth: number) => {
    const key = `job:${job.id}`;
    const isExpanded = expanded.has(key);
    const jobActive = location.pathname === `/jobs/${job.id}`;
    return (
      <div key={job.id}>
        <Row
          to={`/jobs/${job.id}`}
          icon={IconFolder}
          label={job.title}
          depth={depth}
          active={jobActive}
          expandable
          expanded={isExpanded}
          onToggle={() => toggle(key)}
        />
        {isExpanded &&
          JOB_LEAF_TABS.map((t) => {
            const tabActive = jobActive && (searchTab === t.tab || (!searchTab && t.tab === "projects"));
            return (
              <LeafRow
                key={t.tab}
                to={t.tab === "projects" ? `/jobs/${job.id}` : `/jobs/${job.id}?tab=${t.tab}`}
                label={t.label}
                depth={depth + 1}
                active={tabActive}
              />
            );
          })}
      </div>
    );
  };

  const renderOrg = (node: SidebarOrgNode, depth: number) => {
    const key = `org:${node.org.id}`;
    const isExpanded = expanded.has(key);
    const active = location.pathname === `/organizations/${node.org.id}`;
    return (
      <div key={node.org.id}>
        <Row
          to={`/organizations/${node.org.id}`}
          icon={IconBuilding}
          label={node.org.name}
          depth={depth}
          active={active}
          expandable={node.jobs.length > 0}
          expanded={isExpanded}
          onToggle={() => toggle(key)}
        />
        {isExpanded && node.jobs.map((job) => renderJob(job, depth + 1))}
      </div>
    );
  };

  const renderGroup = (node: SidebarGroupNode) => {
    const key = `group:${node.group.id}`;
    const isExpanded = expanded.has(key);
    const active = location.pathname === `/groups/${node.group.id}`;
    const hasChildren = node.orgs.length > 0 || node.jobs.length > 0;
    return (
      <div key={node.group.id}>
        <Row
          to={`/groups/${node.group.id}`}
          icon={IconLayers}
          label={node.group.name}
          depth={1}
          active={active}
          expandable={hasChildren}
          expanded={isExpanded}
          onToggle={() => toggle(key)}
        />
        {isExpanded && (
          <>
            {node.orgs.map((o) => renderOrg(o, 2))}
            {node.jobs.map((job) => renderJob(job, 2))}
          </>
        )}
      </div>
    );
  };

  // "Gruplar" ve "Organizasyonlar" eskiden sabit birer sayfaya giden düz linkti
  // (/groups, /organizations — oradaki "+" ile yenisi eklenir); şimdi aynı sayfaya
  // giden ama aynı zamanda içindekileri açıp kapatabilen birer kategori başlığı.
  const groupsActive = location.pathname === "/groups";
  const orgsActive = location.pathname === "/organizations";

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "#6B7480",
          padding: "2px 10px 8px",
        }}
      >
        Çalışma alanı
      </div>

      {groups.length > 0 && (
        <div>
          <Row
            to="/groups"
            icon={IconLayers}
            label="Gruplar"
            depth={0}
            active={groupsActive}
            expandable
            expanded={expanded.has("cat:groups")}
            onToggle={() => toggle("cat:groups")}
          />
          {expanded.has("cat:groups") && groups.map(renderGroup)}
        </div>
      )}

      {standaloneOrgs.length > 0 && (
        <div>
          <Row
            to="/organizations"
            icon={IconBuilding}
            label="Organizasyonlar"
            depth={0}
            active={orgsActive}
            expandable
            expanded={expanded.has("cat:orgs")}
            onToggle={() => toggle("cat:orgs")}
          />
          {expanded.has("cat:orgs") && standaloneOrgs.map((o) => renderOrg(o, 1))}
        </div>
      )}

      {standaloneJobs.map((job) => renderJob(job, 0))}
    </div>
  );
}

function Row({
  to,
  icon: Icon,
  label,
  depth,
  active,
  expandable,
  expanded,
  onToggle,
}: {
  to: string;
  icon: IconComp;
  label: string;
  depth: number;
  active: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Daralt" : "Genişlet"}
          style={{
            width: 20,
            height: 28,
            flexShrink: 0,
            marginLeft: depth * 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
          }}
        >
          {expanded ? <IconChevronDown size={11} color={INACTIVE_ICON} /> : <IconChevronRight size={11} color={INACTIVE_ICON} />}
        </button>
      ) : (
        <span style={{ width: 20, marginLeft: depth * 14, flexShrink: 0 }} />
      )}
      <Link
        to={to}
        title={label}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          borderRadius: 7,
          background: active ? "rgba(255,255,255,0.08)" : "transparent",
        }}
      >
        <Icon size={13} color={active ? colors.light.accent : INACTIVE_ICON} />
        <span
          style={{
            fontSize: 14,
            color: active ? "#fff" : INACTIVE_TEXT,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </Link>
    </div>
  );
}

function LeafRow({ to, label, depth, active }: { to: string; label: string; depth: number; active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ width: 20, marginLeft: depth * 14, flexShrink: 0 }} />
      <Link
        to={to}
        title={label}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          padding: "5px 8px",
          borderRadius: 7,
          background: active ? "rgba(255,255,255,0.08)" : "transparent",
          borderLeft: active ? `2px solid ${colors.light.accent}` : "2px solid transparent",
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: active ? "#fff" : "#98A2B0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </Link>
    </div>
  );
}
