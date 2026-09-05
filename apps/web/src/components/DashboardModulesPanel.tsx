import { useEffect, useState } from "react";
import type { Job, JobModule, ModuleCatalogEntry } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useUndo } from "../lib/undo";
import { IconSparkle, IconX } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  jobs: Job[];
}

// Anasayfadaki "Modüller" sekmesi: serbest çalışana uygun modülleri (module_catalog,
// applies_to_freelancer=true) listeler; kullanıcı istediği modülü istediği işe atar.
// Bir şirket/işletme kurduğunda bu sekme yerini departman modüllerine bırakır
// (bkz. OrganizationDetail > Departmanlar).
export default function DashboardModulesPanel({ jobs }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [byJob, setByJob] = useState<Record<string, JobModule[]>>({});
  const [loading, setLoading] = useState(true);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pushUndo } = useUndo();

  const loadAssignments = () => {
    if (jobs.length === 0) {
      setByJob({});
      return;
    }
    Promise.all(
      jobs.map((j) =>
        api
          .get<JobModule[]>(`/jobs/${j.id}/modules`)
          .then((list) => [j.id, list] as const)
          .catch(() => [j.id, []] as const)
      )
    ).then((entries) => setByJob(Object.fromEntries(entries)));
  };

  useEffect(() => {
    setLoading(true);
    api
      .get<ModuleCatalogEntry[]>("/module-catalog?freelancer=true")
      .then(setCatalog)
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadAssignments, [jobs]);

  const assignedJobsFor = (moduleKey: string) => jobs.filter((j) => (byJob[j.id] ?? []).some((m) => m.moduleKey === moduleKey));

  // Modül atama/kaldırma tersine çevrilebilir bir eşleştirme olduğu için geri
  // alma basit: karşıt isteği at ve listeyi tazele (kayıtlar silinmiyor).
  const assign = async (moduleKey: string, jobId: string) => {
    setBusy(true);
    try {
      await api.post(`/jobs/${jobId}/modules`, { moduleKey });
      setPickerFor(null);
      loadAssignments();
      pushUndo({
        label: "Modül atama",
        run: async () => {
          await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
          loadAssignments();
        },
        redo: async () => {
          await api.post(`/jobs/${jobId}/modules`, { moduleKey });
          loadAssignments();
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (moduleKey: string, jobId: string) => {
    setBusy(true);
    try {
      await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
      loadAssignments();
      pushUndo({
        label: "Modül kaldırma",
        run: async () => {
          await api.post(`/jobs/${jobId}/modules`, { moduleKey });
          loadAssignments();
        },
        redo: async () => {
          await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
          loadAssignments();
        },
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  if (catalog.length === 0) {
    return (
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
        {t("Serbest çalışanlar için henüz açılmış bir modül yok.")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 4px" }}>
        Aşağıdaki modülleri istediğin işe atayabilirsin. Bir şirket ya da işletme kurduğunda bu görünüm yerini
        departmanlara bırakır.
      </p>
      {catalog.map((entry) => {
        const assignedJobs = assignedJobsFor(entry.key);
        return (
          <div key={entry.key} style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: c.background,
                  flexShrink: 0,
                }}
              >
                <IconSparkle size={13} color={c.textSecondary} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: c.textPrimary }}>{entry.name}</div>
                {entry.description && <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>{entry.description}</div>}
              </div>
              {jobs.length > 0 && (
                <button
                  onClick={() => setPickerFor(pickerFor === entry.key ? null : entry.key)}
                  style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", flexShrink: 0 }}
                >
                  {t("+ İşe ata")}
                </button>
              )}
            </div>

            {pickerFor === entry.key && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {jobs
                  .filter((j) => !assignedJobs.some((aj) => aj.id === j.id))
                  .map((j) => (
                    <button
                      key={j.id}
                      disabled={busy}
                      onClick={() => assign(entry.key, j.id)}
                      style={{ fontSize: 13, padding: "5px 10px", borderRadius: 20, border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary }}
                    >
                      {j.title}
                    </button>
                  ))}
              </div>
            )}

            {assignedJobs.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {assignedJobs.map((j) => (
                  <span
                    key={j.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 13,
                      padding: "4px 6px 4px 10px",
                      borderRadius: 20,
                      background: `${c.primary}18`,
                      color: c.primaryDark,
                    }}
                  >
                    {j.title}
                    <button
                      onClick={() => unassign(entry.key, j.id)}
                      disabled={busy}
                      aria-label={t("İşten kaldır")}
                      style={{ display: "flex", background: "transparent", border: "none" }}
                    >
                      <IconX size={11} color={c.primaryDark} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
