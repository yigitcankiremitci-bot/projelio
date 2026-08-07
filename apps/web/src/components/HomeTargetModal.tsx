import { useMemo, useState } from "react";
import { colors } from "../theme/colors";
import Modal from "./Modal";
import { useSidebarHierarchy } from "../lib/useSidebarHierarchy";
import { DEFAULT_HOME_TARGET, setHomeTarget, useHomeTarget, type HomeTarget } from "../lib/homeTarget";
import {
  IconBuilding,
  IconLayers,
  IconBriefcase,
  IconListCheck,
  IconDashboard,
  IconCalendar,
  IconActivity,
  IconFile,
  IconCheck,
} from "./icons";

type IconComp = typeof IconBuilding;

interface Option extends HomeTarget {
  icon: IconComp;
}

interface Section {
  title: string;
  options: Option[];
}

// Sabit uygulama sayfaları. Bütçe ve Dosyalar anasayfanın sekmeleridir (bkz.
// Dashboard.tsx ?tab=), bu yüzden yolları sorgu parametreli.
const PAGE_OPTIONS: Option[] = [
  { path: "/", label: "Ana Sayfa", icon: IconDashboard },
  { path: "/?tab=budget", label: "Bütçe", icon: IconActivity },
  { path: "/?tab=files", label: "Dosyalar", icon: IconFile },
  { path: "/calendar", label: "Takvim", icon: IconCalendar },
  { path: "/tasks", label: "Yapılacaklar", icon: IconListCheck },
];

interface Props {
  onClose: () => void;
}

/**
 * "Ana Sayfa" düğmesinin hangi sayfaya gideceğini seçtiren liste. Seçenekler
 * sabit uygulama sayfaları + kullanıcının erişebildiği çalışma alanı
 * (grup / şirket / departman / iş) kayıtlarıdır — yani sidebar ağacının aynısı.
 */
export default function HomeTargetModal({ onClose }: Props) {
  const c = colors.light;
  const current = useHomeTarget();
  const { groups, standaloneOrgs, standaloneJobs, loading } = useSidebarHierarchy();
  const [query, setQuery] = useState("");

  const sections = useMemo<Section[]>(() => {
    const orgNodes = [...groups.flatMap((g) => g.orgs), ...standaloneOrgs];
    const allJobs = [
      ...groups.flatMap((g) => [...g.orgs.flatMap((o) => o.jobs), ...g.jobs]),
      ...standaloneOrgs.flatMap((o) => o.jobs),
      ...standaloneJobs,
    ];

    return [
      { title: "Sayfalar", options: PAGE_OPTIONS },
      {
        title: "Gruplar",
        options: groups.map((g) => ({ path: `/groups/${g.group.id}`, label: g.group.name, icon: IconLayers })),
      },
      {
        title: "Şirketler",
        options: orgNodes.map((o) => ({ path: `/organizations/${o.org.id}`, label: o.org.name, icon: IconBuilding })),
      },
      {
        title: "Departmanlar",
        options: orgNodes.flatMap((o) =>
          o.departments.map((d) => ({ path: `/departments/${d.id}`, label: d.name, icon: IconListCheck }))
        ),
      },
      {
        title: "İşler",
        options: allJobs.map((j) => ({ path: `/jobs/${j.id}`, label: j.title, icon: IconBriefcase })),
      },
    ];
  }, [groups, standaloneOrgs, standaloneJobs]);

  const normalized = query.trim().toLocaleLowerCase("tr");
  const visibleSections = sections
    .map((s) => ({
      ...s,
      options: normalized ? s.options.filter((o) => o.label.toLocaleLowerCase("tr").includes(normalized)) : s.options,
    }))
    .filter((s) => s.options.length > 0);

  const choose = (option: Option) => {
    setHomeTarget({ path: option.path, label: option.label });
    onClose();
  };

  return (
    <Modal title="Ana Sayfa düğmesi" onClose={onClose} maxWidth={460}>
      <p style={{ margin: "0 0 14px", fontSize: 14, color: c.textSecondary, lineHeight: 1.5 }}>
        Menüdeki <strong style={{ color: c.textPrimary, fontWeight: 500 }}>Ana Sayfa</strong> düğmesine bastığında
        nereye gitmek istersin? Bu tercih yalnızca bu cihazda geçerlidir.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ara"
        aria-label="Hedef ara"
        style={{ width: "100%", marginBottom: 12 }}
      />

      {loading && <p style={{ fontSize: 14, color: c.textSecondary }}>Yükleniyor…</p>}

      {!loading && visibleSections.length === 0 && (
        <p style={{ fontSize: 14, color: c.textSecondary }}>Eşleşen bir yer yok.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {visibleSections.map((section) => (
          <div key={section.title}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: c.textSecondary,
                margin: "0 0 6px 2px",
              }}
            >
              {section.title}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {section.options.map((option) => {
                const selected = option.path === current.path;
                const Icon = option.icon;
                return (
                  <button
                    key={option.path}
                    type="button"
                    onClick={() => choose(option)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "9px 10px",
                      borderRadius: 9,
                      border: `1px solid ${selected ? c.accent : "transparent"}`,
                      background: selected ? "rgba(192,129,63,0.10)" : "transparent",
                      color: c.textPrimary,
                      fontSize: 15,
                      textAlign: "left",
                    }}
                  >
                    <Icon size={15} color={selected ? c.accentDark : c.textSecondary} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {option.label}
                    </span>
                    {selected && <IconCheck size={15} color={c.accentDark} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {current.path !== DEFAULT_HOME_TARGET.path && (
        <button
          type="button"
          onClick={() => {
            setHomeTarget(null);
            onClose();
          }}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textSecondary,
            fontSize: 14,
          }}
        >
          Varsayılana döndür
        </button>
      )}
    </Modal>
  );
}
