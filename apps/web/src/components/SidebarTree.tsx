import { useEffect, useState } from "react";
import { findCoverPreset } from "../lib/covers";
import { Link, useLocation } from "react-router-dom";
import type { Department, Job } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { useSidebarHierarchy, SidebarGroupNode, SidebarOrgNode } from "../lib/useSidebarHierarchy";
import { useT } from "../lib/i18n";
import {
  IconBuilding,
  IconBriefcase,
  IconLayers,
  IconFolder,
  IconListCheck,
  IconChevronRight,
  IconChevronDown,
  IconActivity,
  IconUser,
  IconFile,
} from "./icons";

type IconComp = typeof IconBuilding;

// İş düğümünün altında her zaman gösterilen sabit kısayollar — JobTabs'taki
// sekmelerin karşılığı. Veriye bağlı değildir (bir işin henüz projesi olmasa
// bile "Projeler" kısayolu görünür, tıklayınca boş listeyi gösterir). "Ekip"/
// "Dosyalar" da ikon taşır ki Projeler/Rutinler'in Row tabanlı satırlarıyla
// aynı hizada dursun (bkz. LeafRow icon prop). "programs" tab anahtarı kodda
// (rota/JobDetail) hâlâ "program" (operation), yalnızca kullanıcıya görünen
// etiket "Rutinler" — "Program" adı kafa karıştırıyordu.
const JOB_LEAF_TABS: { tab: string; label: string; icon: IconComp }[] = [
  { tab: "projects", label: "Projeler", icon: IconFolder },
  { tab: "programs", label: "Rutinler", icon: IconActivity },
  { tab: "team", label: "Ekip", icon: IconUser },
  { tab: "files", label: "Dosyalar", icon: IconFile },
];

const INACTIVE_ICON = "#9AA6B4";
const INACTIVE_TEXT = "#C7CCD6";

/**
 * Sol menüdeki Grup > Organizasyon > İş > (Projeler/Rutinler/Ekip/Dosyalar)
 * gezinme ağacı. Yalnızca gerçekten var olan seviyeler gösterilir — grubu ya da
 * organizasyonu olmayan bir kullanıcı için hiçbir şey render etmez.
 */
export default function SidebarTree() {
  const location = useLocation();
  const t = useT();
  const { groups, standaloneOrgs, standaloneJobs, openProjectsByJobId, openOperationsByJobId, loading } =
    useSidebarHierarchy();
  // "Gruplar" ve "Organizasyonlar" kategori başlıkları, eski düz linklerin yerini
  // aldığı için varsayılan olarak açık başlar (kullanıcı eskisi gibi listeyi hemen
  // görsün); tekil grup/organizasyon/iş düğümleri ise varsayılan kapalı.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["cat:groups", "cat:orgs"]));
  // Bir organizasyona/gruba bağlı olmayan işler ("İşlerim" sayfasındaki bağımsız
  // işler) sidebar'da alt alta serilmek yerine tek bir "İşlerim" düğümünde
  // toplanır. Düğüm varsayılan olarak AÇIK geldiği için açık olanı değil,
  // kullanıcının onu elle kapatıp kapatmadığını tutuyoruz.
  const [myJobsCollapsed, setMyJobsCollapsed] = useState(false);

  // Kullanıcı derinlerdeyken (bir işin/organizasyonun/grubun içindeyken) o yolu
  // otomatik aç — elle açılmış diğer dalları kapatmadan, sadece ekler.
  useEffect(() => {
    const jobMatch = location.pathname.match(/^\/jobs\/([^/]+)/);
    const orgMatch = location.pathname.match(/^\/organizations\/([^/]+)/);
    const groupMatch = location.pathname.match(/^\/groups\/([^/]+)/);
    const deptMatch = location.pathname.match(/^\/departments\/([^/]+)/);
    // Bir proje/rutin sayfasındaysak da işin (dolayısıyla üstündeki
    // organizasyon/grubun) açılması gerekir — aksi halde aktif satır (bkz.
    // renderJob'un altına eklediği proje/rutin kısayolları) ağaçta gizli
    // kalır. Hangi işe ait olduğu id üzerinden açık listelerden bulunur.
    const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
    const operationMatch = location.pathname.match(/^\/operations\/([^/]+)/);
    if (!jobMatch && !orgMatch && !groupMatch && !deptMatch && !projectMatch && !operationMatch) return;

    const allJobs: Job[] = [
      ...groups.flatMap((g) => [...g.orgs.flatMap((o) => o.jobs), ...g.jobs]),
      ...standaloneOrgs.flatMap((o) => o.jobs),
      ...standaloneJobs,
    ];

    let derivedJobId: string | undefined;
    if (projectMatch) {
      for (const [jobId, projects] of openProjectsByJobId) {
        if (projects.some((p) => p.id === projectMatch[1])) {
          derivedJobId = jobId;
          break;
        }
      }
    }
    if (!derivedJobId && operationMatch) {
      for (const [jobId, ops] of openOperationsByJobId) {
        if (ops.some((op) => op.id === operationMatch[1])) {
          derivedJobId = jobId;
          break;
        }
      }
    }
    const effectiveJobId = jobMatch?.[1] ?? derivedJobId;

    setExpanded((prev) => {
      const next = new Set(prev);
      if (effectiveJobId) {
        const job = allJobs.find((j) => j.id === effectiveJobId);
        next.add(`job:${effectiveJobId}`);
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
      // Doğrudan bir proje/rutinin sayfasına gelindiyse "Projeler"/"Rutinler"
      // alt listesi de açık gelsin — aksi halde aktif kart bulunması için
      // kullanıcının ayrıca tıklaması gerekirdi.
      if (projectMatch && effectiveJobId) next.add(`jobtab:${effectiveJobId}:projects`);
      if (operationMatch && effectiveJobId) next.add(`jobtab:${effectiveJobId}:programs`);
      if (orgMatch) {
        // NOT: organizasyonun KENDİSİ (`org:${id}`) burada eklenmiyor —
        // organizasyon satırına tıklamak zaten o sayfaya götürüyor, departman/iş
        // alt listesinin de otomatik açılması istenmeyen bir yan etkiydi (bkz.
        // Row onLabelDoubleClick: açıp kapatmak artık bilinçli bir eylem).
        // Yalnızca üst grup/kategori açılır ki bu organizasyonun satırı, kapalı
        // bir grubun altında gizli kalmasın.
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
      if (deptMatch) {
        const allOrgNodes: SidebarOrgNode[] = [...groups.flatMap((g) => g.orgs), ...standaloneOrgs];
        const parentOrgNode = allOrgNodes.find((node) => node.departments.some((d) => d.id === deptMatch[1]));
        if (parentOrgNode) {
          next.add(`org:${parentOrgNode.org.id}`);
          const parentGroup = groups.find((g) => g.orgs.some((o) => o.org.id === parentOrgNode.org.id));
          if (parentGroup) {
            next.add(`group:${parentGroup.group.id}`);
            next.add("cat:groups");
          } else {
            next.add("cat:orgs");
          }
        }
      }
      return next;
    });

    // Bağımsız bir işin içine girildiyse, kullanıcı daha önce elle kapatmış olsa
    // bile "İşlerim" düğümünü tekrar aç — aksi halde aktif satır görünmez olurdu.
    if (effectiveJobId) {
      const job = allJobs.find((j) => j.id === effectiveJobId);
      if (job && !job.organizationId && !job.groupId) setMyJobsCollapsed(false);
    }
    // groups/standaloneOrgs/standaloneJobs referansları her fetch'te değişir;
    // burada yalnızca rota değiştiğinde tetiklenmesi yeterli. openProjectsByJobId/
    // openOperationsByJobId ise yalnızca ilk veri geldiğinde bir kez değişir —
    // proje/rutin sayfasına doğrudan girildiğinde (sidebar verisi henüz
    // yüklenmemişken) eşleşmeyi yakalamak için bağımlılıkta tutuluyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, openProjectsByJobId, openOperationsByJobId]);

  // Tek organizasyon durumunda "Organizasyonlar" başlığı kaldırıldığı için o
  // organizasyon artık en üst seviyede duruyor; eskiden kategori açık geldiğinde
  // görünen alt öğeler kaybolmasın diye varsayılan olarak açık başlatılır.
  const soleOrgId = standaloneOrgs.length === 1 ? standaloneOrgs[0].org.id : null;
  useEffect(() => {
    if (!soleOrgId) return;
    setExpanded((prev) => (prev.has(`org:${soleOrgId}`) ? prev : new Set(prev).add(`org:${soleOrgId}`)));
  }, [soleOrgId]);

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
    const openProjects = openProjectsByJobId.get(job.id) ?? [];
    const openOperations = openOperationsByJobId.get(job.id) ?? [];
    return (
      <div key={job.id}>
        <Row
          to={`/jobs/${job.id}`}
          icon={IconFolder}
          imageUrl={job.coverImageUrl}
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

            // "Projeler"/"Rutinler": kendi kapak resmiyle tek tek listelenen açık
            // öğeleri olduğu için (bkz. useSidebarHierarchy openProjectsByJobId/
            // openOperationsByJobId) diğer sabit sekmeler gibi düz bir link değil,
            // iş/organizasyon düğümleriyle aynı açılır-kapanır Row kullanılır.
            if (t.tab === "projects" || t.tab === "programs") {
              const isProjects = t.tab === "projects";
              const items = isProjects ? openProjects : openOperations;
              const subKey = `jobtab:${job.id}:${t.tab}`;
              const subExpanded = expanded.has(subKey);
              return (
                <div key={t.tab}>
                  <Row
                    to={isProjects ? `/jobs/${job.id}` : `/jobs/${job.id}?tab=${t.tab}`}
                    icon={t.icon}
                    label={t.label}
                    depth={depth + 1}
                    active={tabActive}
                    expandable={items.length > 0}
                    expanded={subExpanded}
                    onToggle={() => toggle(subKey)}
                    onLabelDoubleClick={items.length > 0 ? () => toggle(subKey) : undefined}
                  />
                  {subExpanded &&
                    (isProjects
                      ? openProjects.map((p) => (
                          <Row
                            key={p.id}
                            to={`/projects/${p.id}`}
                            icon={IconFolder}
                            imageUrl={p.coverImageUrl}
                            label={p.title}
                            depth={depth + 2}
                            active={location.pathname === `/projects/${p.id}`}
                            expandable={false}
                            expanded={false}
                            onToggle={() => {}}
                          />
                        ))
                      : openOperations.map((op) => (
                          <Row
                            key={op.id}
                            to={`/operations/${op.id}`}
                            icon={IconActivity}
                            imageUrl={op.coverImageUrl}
                            label={op.title}
                            depth={depth + 2}
                            active={location.pathname === `/operations/${op.id}`}
                            expandable={false}
                            expanded={false}
                            onToggle={() => {}}
                          />
                        )))}
                </div>
              );
            }

            return (
              <LeafRow
                key={t.tab}
                to={`/jobs/${job.id}?tab=${t.tab}`}
                icon={t.icon}
                label={t.label}
                depth={depth + 1}
                active={tabActive}
              />
            );
          })}
      </div>
    );
  };

  const renderDepartment = (dept: Department, depth: number) => {
    const active = location.pathname === `/departments/${dept.id}`;
    return (
      <Row
        key={dept.id}
        to={`/departments/${dept.id}`}
        icon={IconListCheck}
        label={dept.name}
        depth={depth}
        active={active}
        expandable={false}
        expanded={false}
        onToggle={() => {}}
      />
    );
  };

  const renderOrg = (node: SidebarOrgNode, depth: number) => {
    const key = `org:${node.org.id}`;
    const isExpanded = expanded.has(key);
    const active = location.pathname === `/organizations/${node.org.id}`;
    const hasChildren = node.departments.length > 0 || node.jobs.length > 0;
    return (
      <div key={node.org.id}>
        <Row
          to={`/organizations/${node.org.id}`}
          icon={IconBuilding}
          imageUrl={node.org.coverImageUrl}
          label={node.org.name}
          depth={depth}
          active={active}
          expandable={hasChildren}
          expanded={isExpanded}
          onToggle={() => toggle(key)}
          onLabelDoubleClick={hasChildren ? () => toggle(key) : undefined}
        />
        {isExpanded && (
          <>
            {node.departments.map((dept) => renderDepartment(dept, depth + 1))}
            {node.jobs.map((job) => renderJob(job, depth + 1))}
          </>
        )}
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
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "#6B7480",
          padding: "2px 10px 8px",
        }}
      >
        {t("Çalışma alanı")}
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

      {/* Tek bir organizasyon varsa "Organizasyonlar" başlığı gereksiz bir ara
          katman oluyor: onun yerine organizasyonun kendisi doğrudan en üst
          seviyede, kapak resminin minik hâliyle birlikte gösterilir. Birden fazla
          olduğunda eski kategori başlığı davranışı korunur. */}
      {standaloneOrgs.length === 1 && renderOrg(standaloneOrgs[0], 0)}

      {standaloneOrgs.length > 1 && (
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

      {/* Bir organizasyona/gruba bağlı olmayan işler tek tek kök seviyede
          durmak yerine kapatılabilir bir "İşlerim" düğümü altında toplanır.
          İşlerin tam listesi zaten Ana Sayfa'da olduğu için tek tıklama oraya
          götürür (bkz. Dashboard varsayılan "jobs" sekmesi); açıp kapatmak
          artık yalnızca oktaki dar hedefte değil, metne çift tıklayarak da
          yapılabilir (bkz. Row onLabelDoubleClick). */}
      {standaloneJobs.length > 0 && (
        <div>
          <Row
            to="/"
            icon={IconBriefcase}
            label={t("İşlerim")}
            depth={0}
            active={location.pathname === "/"}
            expandable
            expanded={!myJobsCollapsed}
            onToggle={() => setMyJobsCollapsed((v) => !v)}
            onLabelDoubleClick={() => setMyJobsCollapsed((v) => !v)}
          />
          {!myJobsCollapsed && standaloneJobs.map((job) => renderJob(job, 1))}
        </div>
      )}
    </div>
  );
}

function Row({
  to,
  icon: Icon,
  imageUrl,
  label,
  depth,
  active,
  expandable,
  expanded,
  onToggle,
  onLabelDoubleClick,
}: {
  // Verilmezse satır bir link değil, sadece alt öğeleri açıp kapatan bir başlık
  // olur (örn. gidilecek bir sayfası olmayan "İşler" toplayıcısı).
  to?: string;
  icon: IconComp;
  // Varsa ikon yerine gösterilen minik kapak resmi (örn. organizasyonun kapağı).
  // Yüklenemezse sessizce ikona geri düşülür.
  imageUrl?: string;
  label: string;
  depth: number;
  active: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  // Verilirse, satırın metnine çift tıklamak da (oktaki tekil tıklamanın yanı
  // sıra) açıp kapatır — tek tıklama linke tıklamış gibi sayfaya gider, bu
  // yüzden "genişlet" işlevi normalde yalnızca oktaki dar hedeften erişilebilir;
  // çift tıklama daha büyük, bulması kolay bir alternatif hedef sağlar (bkz.
  // "şirket başlığı" org satırı, "İşlerim" düğümü).
  onLabelDoubleClick?: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [imageFailed, setImageFailed] = useState(false);
  // Hazır kapaklar (preset:...) bir dosya değil CSS gradyanıdır; <img> ile
  // gösterilemez, küçük renkli bir kare olarak çizilir.
  const presetCover = findCoverPreset(imageUrl);
  const showImage = Boolean(imageUrl) && !presetCover && !imageFailed;
  const contentStyle = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 7,
    background: active ? "rgba(255,255,255,0.08)" : "transparent",
    border: "none",
    textAlign: "left" as const,
  };
  const content = (
    <>
      {presetCover ? (
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            flexShrink: 0,
            background: presetCover.background,
            border: active ? `1px solid ${c.accent}` : "1px solid rgba(255,255,255,0.15)",
          }}
        />
      ) : showImage ? (
        <img
          src={imageUrl}
          alt=""
          onError={() => setImageFailed(true)}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            objectFit: "cover",
            flexShrink: 0,
            border: active ? `1px solid ${c.accent}` : "1px solid rgba(255,255,255,0.15)",
          }}
        />
      ) : (
        <Icon size={15} color={active ? c.accent : INACTIVE_ICON} />
      )}
      <span
        style={{
          // iOS Safari, 16px altındaki metinlerde okunabilirlik için otomatik
          // ölçekleme/zoom uygulayabiliyor; sidebar satırlarını 16px'in altına
          // düşürmüyoruz.
          fontSize: 16,
          color: active ? "#fff" : INACTIVE_TEXT,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </>
  );
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? t("Daralt") : t("Genişlet")}
          style={{
            width: 20,
            height: 30,
            flexShrink: 0,
            marginLeft: depth * 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
          }}
        >
          {expanded ? <IconChevronDown size={12} color={INACTIVE_ICON} /> : <IconChevronRight size={12} color={INACTIVE_ICON} />}
        </button>
      ) : (
        <span style={{ width: 20, marginLeft: depth * 14, flexShrink: 0 }} />
      )}
      {to ? (
        <Link to={to} title={label} onDoubleClick={onLabelDoubleClick} style={contentStyle}>
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          onDoubleClick={onLabelDoubleClick}
          title={label}
          style={{ ...contentStyle, background: "transparent" }}
        >
          {content}
        </button>
      )}
    </div>
  );
}

function LeafRow({
  to,
  icon: Icon,
  label,
  depth,
  active,
}: {
  to: string;
  // Verilirse Row'daki gibi ikon + boşluk + etiket düzeni kullanılır. Sabit
  // sekmelerden ikonu olmayanlar (yalnızca metin) eski haliyle kalır; ikonlu
  // olanlar ikon aynı satırda kardeşleriyle (bkz. Projeler/Rutinler Row'u)
  // hizalansın diye eklendi — aksi halde metin ikonsuz daha geride başlıyordu.
  icon?: IconComp;
  label: string;
  depth: number;
  active: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
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
          gap: 8,
          padding: "5px 8px",
          borderRadius: 7,
          background: active ? "rgba(255,255,255,0.08)" : "transparent",
          borderLeft: active ? `2px solid ${c.accent}` : "2px solid transparent",
        }}
      >
        {Icon && <Icon size={15} color={active ? c.accent : INACTIVE_ICON} />}
        <span
          style={{
            fontSize: 16,
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
