import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Job, JobModule, ModuleCatalogEntry } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { moduleModalWidth } from "../lib/moduleSurfaces";
import ModuleSurface from "./ModuleSurface";
import ModuleTeamPanel from "./ModuleTeamPanel";
import Modal from "./Modal";
import { IconSparkle } from "./icons";
import { useT } from "../lib/i18n";

// ModuleCard.tsx ile aynı sabit kart yüksekliği — anasayfadaki modül kartları
// şirket sayfasındakilerle aynı ölçüde dursun.
const CARD_HEIGHT = 128;

interface Props {
  jobs: Job[];
}

interface AssignedModule {
  job: Job;
  moduleKey: string;
  moduleName: string;
}

/**
 * Anasayfanın (İşler sekmesi) en altındaki "Modüllerim" bölümü: kullanıcının
 * "Modüller" sekmesinden bir işe atadığı modüller burada, işleriyle birlikte
 * listelenir. Bir modüle tıklanınca kendi kayıt defteri açılır — kayıtlar
 * organizasyona değil o işe bağlıdır (bkz. 037_freelancer_modules.sql).
 * Hiç modül atanmamışsa bölüm hiç render edilmez.
 */
export default function DashboardAssignedModules({ jobs }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [assigned, setAssigned] = useState<AssignedModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    if (jobs.length === 0) {
      setAssigned([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.get<ModuleCatalogEntry[]>("/module-catalog?freelancer=true").catch(() => []),
      Promise.all(
        jobs.map((job) =>
          api
            .get<JobModule[]>(`/jobs/${job.id}/modules`)
            .then((list) => ({ job, list }))
            .catch(() => ({ job, list: [] as JobModule[] }))
        )
      ),
    ])
      .then(([catalog, perJob]) => {
        if (cancelled) return;
        const nameByKey = new Map(catalog.map((entry) => [entry.key, entry.name]));
        const rows: AssignedModule[] = [];
        for (const { job, list } of perJob) {
          for (const m of list) {
            rows.push({ job, moduleKey: m.moduleKey, moduleName: nameByKey.get(m.moduleKey) ?? m.moduleKey });
          }
        }
        // Aynı modül birden çok işe atanmış olabilir; önce modül adına, sonra işe göre.
        rows.sort((a, b) => a.moduleName.localeCompare(b.moduleName, "tr") || a.job.title.localeCompare(b.job.title, "tr"));
        setAssigned(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobs]);

  const open = assigned.find((item) => `${item.job.id}:${item.moduleKey}` === openKey);

  if (loading || assigned.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.textPrimary }}>{t("Modüllerim")}</h2>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: c.textSecondary,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 999,
            padding: "1px 8px",
          }}
        >
          {assigned.length}
        </span>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: c.textSecondary }}>
        İşlerine attığın modüller. Kayıtlarını görmek için bir karta tıkla — yenisini "Modüller" sekmesinden
        ekleyebilirsin.
      </p>

      {/* Şirket sayfasındaki Modüller sekmesiyle (bkz. ModulesPanel + ModuleCard)
          aynı ızgara ve sabit kart boyu. Kartın alt satırı orada modülün
          açıklamasıyken burada modülün atandığı iş. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        {assigned.map((item) => {
          const key = `${item.job.id}:${item.moduleKey}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setOpenKey(key)}
              className="entity-card"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                textAlign: "left",
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                background: c.surface,
                height: CARD_HEIGHT,
                padding: 16,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: c.background,
                    flexShrink: 0,
                  }}
                >
                  <IconSparkle size={13} color={c.textSecondary} />
                </span>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 500,
                    color: c.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.moduleName}
                </h3>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: c.textSecondary,
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}
              >
                {item.job.title}
              </p>
            </button>
          );
        })}
      </div>

      {open && (
        <Modal
          title={open.moduleName}
          onClose={() => setOpenKey(null)}
          maxWidth={moduleModalWidth(open.moduleKey)}
          mobileFullScreen
        >
          <ModuleSurface jobId={open.job.id} moduleKey={open.moduleKey} moduleName={open.moduleName} />
          {/* Serbest çalışan bir işe başkasını aldıysa (job_members) o kişiyi de
              modüle atayabilsin — tek kişilik kullanımda ekip boş kalır. */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
            <ModuleTeamPanel jobId={open.job.id} moduleKey={open.moduleKey} />
          </div>
          <Link
            to={`/jobs/${open.job.id}`}
            style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: c.primary }}
          >
            {open.job.title} işine git →
          </Link>
        </Modal>
      )}
    </div>
  );
}
