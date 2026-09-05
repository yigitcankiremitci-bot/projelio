import { useEffect, useRef, useState } from "react";
import type { Output, Project, Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import AssigneePicker from "./AssigneePicker";
import AutoGrowTextarea from "./AutoGrowTextarea";
import { useT } from "../lib/i18n";

interface Props {
  // Sabit bir proje verilirse proje seçimi gösterilmez (ör. proje sayfasından açılınca).
  projectId?: string;
  // Proje seçimi gösterilecekse, seçenekleri bu listeden alır (ör. bir işin projeleri).
  // Verilmezse ve jobId de verilmezse kullanıcının tüm projeleri çekilir.
  projects?: Project[];
  // Proje listesi verilmediyse ve bu doluysa, seçenekler bu işe ait projelerle sınırlanır.
  jobId?: string;
  // Verilirse "İlgili kişi" seçimi gösterilmez, görev doğrudan bu kişiye atanır
  // (ör. iş ekibi sekmesindeki "+" ile hızlı görev atama).
  fixedAssignedTo?: string;
  fixedAssignedToName?: string;
  onClose: () => void;
  // Verilirse sayfa yönlendirmesi yapılmaz, sadece bu çağrılır (liste yerinde
  // güncellenir). Oluşturulan görevi de alır — çağıran bunu Cmd/Ctrl+Z ile geri
  // alınabilir kaydetmek için kullanabilir (bkz. JobTasksPanel).
  onCreated?: (created: Task) => void;
}

export default function CreateTaskModal({
  projectId: fixedProjectId,
  projects: projectsProp,
  jobId,
  fixedAssignedTo,
  fixedAssignedToName,
  onClose,
  onCreated,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [projects, setProjects] = useState<Project[]>(projectsProp ?? []);
  const [projectId, setProjectId] = useState(fixedProjectId ?? "");
  const [loadingProjects, setLoadingProjects] = useState(!fixedProjectId && !projectsProp);

  const [outputs, setOutputs] = useState<Output[]>([]);
  const [outputId, setOutputId] = useState("");
  const [loadingOutputs, setLoadingOutputs] = useState(false);

  // Çoklu atama (bkz. migration 053). "Şu kişi için görev" akışında (bkz.
  // JobTeamPanel) liste o kişiyle başlar ve üzerine ekleme yapılabilir.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(fixedAssignedTo ? [fixedAssignedTo] : []);

  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [durationValue, setDurationValue] = useState("");
  const [durationUnit, setDurationUnit] = useState<"hours" | "days">("hours");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Proje listesi: sabit değilse ve dışarıdan verilmediyse; bir işe bağlıysa o işin
  // projelerini, değilse kullanıcının tüm projelerini çek.
  useEffect(() => {
    if (fixedProjectId || projectsProp) return;
    api
      .get<Project[]>(jobId ? `/jobs/${jobId}/projects` : "/projects")
      .then((ps) => {
        setProjects(ps);
        if (ps.length > 0) setProjectId(ps[0].id);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [fixedProjectId, projectsProp, jobId]);

  // Dışarıdan verilen liste değişirse (ör. iş sayfası ilk yüklendiğinde projeler gelince) senkronize et.
  useEffect(() => {
    if (!projectsProp) return;
    setProjects(projectsProp);
    setProjectId((prev) => prev || (projectsProp.length > 0 ? projectsProp[0].id : ""));
  }, [projectsProp]);

  // Seçilen projeye göre çıktı listesini çek.
  useEffect(() => {
    if (!projectId) {
      setOutputs([]);
      setOutputId("");
      return;
    }
    setLoadingOutputs(true);
    api
      .get<Output[]>(`/projects/${projectId}/outputs`)
      .then((os) => {
        setOutputs(os);
        // Varsayılan: çıktısız proje görevi; istenirse listeden bir çıktı seçilir.
        setOutputId("");
      })
      .catch(() => setOutputs([]))
      .finally(() => setLoadingOutputs(false));
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setError("");
    setLoading(true);
    try {
      const trimmedDuration = durationValue.trim();
      const created = await api.post<Task>(`/projects/${projectId}/tasks`, {
        title,
        deadline: deadline ? new Date(deadline).toISOString() : new Date().toISOString(),
        status: "todo",
        // Çıktı seçmek zorunlu değil: seçilmezse doğrudan proje görevi olarak eklenir.
        outputId: outputId || undefined,
        assignedToIds: assigneeIds,
        // Tahmini süre opsiyonel: doldurulmadıysa hiç gönderilmez.
        estimatedDurationValue: trimmedDuration ? Number(trimmedDuration) : undefined,
        estimatedDurationUnit: trimmedDuration ? durationUnit : undefined,
      });
      if (onCreated) {
        onCreated(created);
        onClose();
      } else {
        window.location.href = `/projects/${projectId}`;
      }
    } catch {
      setError("Görev oluşturulamadı. Tekrar dene.");
      setLoading(false);
    }
  };

  const showProjectSelect = !fixedProjectId;
  const noProjects = showProjectSelect && !loadingProjects && projects.length === 0;
  const noOutputs = Boolean(projectId) && !loadingOutputs && outputs.length === 0;

  return (
    <Modal title={fixedAssignedToName ? `${fixedAssignedToName} için yeni görev` : "Yeni görev"} onClose={onClose}>
      {loadingProjects ? (
        <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>{t("Projeler yükleniyor…")}</p>
      ) : noProjects ? (
        <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>
          {t("Görev eklemek için önce bir proje oluşturman gerekiyor.")}
        </p>
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {showProjectSelect && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Proje")}</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: "100%" }}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {loadingOutputs ? (
            <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>{t("Çıktılar yükleniyor…")}</p>
          ) : (
            <>
              {!noOutputs && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Çıktı (opsiyonel)")}</label>
                  <select value={outputId} onChange={(e) => setOutputId(e.target.value)} style={{ width: "100%" }}>
                    <option value="">{t("Çıktısız — proje görevi")}</option>
                    {outputs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Görev başlığı")}</label>
                {/* Uzun başlık tek satırda yatay kayıp okunmaz hale gelmesin
                    diye sararak büyüyen alan (bkz. AutoGrowTextarea). */}
                <AutoGrowTextarea
                  value={title}
                  onChange={setTitle}
                  onSubmit={() => formRef.current?.requestSubmit()}
                  onCancel={onClose}
                  ariaLabel="Görev başlığı"
                  placeholder={t("Örn. Logo revizyonu")}
                  maxLength={200}
                  required
                  minHeight={42}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Bitiş tarihi")}</label>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ width: "100%" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Tahmini süre (opsiyonel)")}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={durationValue}
                    onChange={(e) => setDurationValue(e.target.value)}
                    placeholder={t("Örn. 4")}
                    style={{ flex: 1 }}
                  />
                  <select
                    value={durationUnit}
                    onChange={(e) => setDurationUnit(e.target.value as "hours" | "days")}
                    style={{ flex: 1 }}
                  >
                    <option value="hours">{t("Saat")}</option>
                    <option value="days">{t("Gün")}</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 15, color: c.textSecondary }}>{t("İlgili kişi")}</label>
                {fixedAssignedTo ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: 42,
                      padding: "0 12px",
                      borderRadius: 8,
                      border: `1px solid ${c.border}`,
                      background: c.background,
                      color: c.textPrimary,
                      fontSize: 16,
                    }}
                  >
                    {fixedAssignedToName ?? "Seçili kişi"}
                  </div>
                ) : (
                  // Tüm kullanıcılar yerine yalnızca seçili projenin ekibi, arama ile
                  <AssigneePicker
                    projectId={projectId}
                    multiple
                    values={assigneeIds}
                    onChangeValues={setAssigneeIds}
                    value=""
                    onChange={() => {}}
                  />
                )}
              </div>

              {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

              <button
                type="submit"
                disabled={loading}
                style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
              >
                {loading ? "Oluşturuluyor…" : "Görev oluştur"}
              </button>
            </>
          )}
        </form>
      )}
    </Modal>
  );
}
