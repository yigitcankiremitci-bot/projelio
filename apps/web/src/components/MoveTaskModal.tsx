import { useEffect, useState } from "react";
import type { Department, Output, Project, Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { useUndo } from "../lib/undo";
import { useT } from "../lib/i18n";

export type MoveTarget = "project" | "department" | "output";
type TargetType = MoveTarget;

interface Props {
  taskIds: string[];
  /**
   * Seçili görevlerin kendisi. Verilirse ve hepsi aynı proje/departmandaysa
   * ÇIKTI hedefi de sunulur: çıktı bir projeye ait olduğu için kapsam bilinmeden
   * listelenemiyor. Verilmeyen yüzeylerde (ör. projeler arası Yapılacaklar
   * listesi) sekme hiç çıkmaz.
   */
  scopeTasks?: Task[];
  onClose: () => void;
  /**
   * `target` şart: proje/departman taşımasında görev bu listeden ÇIKAR, çıktı
   * taşımasında ise yerinde kalır. Çağıranlar ikisini ayırt edemezse çıktıya
   * taşınan kartlar ekrandan siliniyormuş gibi görünür.
   */
  onMoved: (movedTasks: Task[], target: MoveTarget) => void;
}

// Seçili görev(ler)i (üst görevse alt görevleriyle birlikte) başka bir projeye ya da
// departmana taşır. Hedef önce tür (Proje/Departman) sonra o türün listesinden
// seçilir — GET /projects ve GET /departments kullanıcının erişebildiği TÜM
// projeler/departmanlar (iş/organizasyon sınırı olmadan) döner.
export default function MoveTaskModal({ taskIds, scopeTasks, onClose, onMoved }: Props) {
  const c = useThemeColors();
  const t = useT();
  const { pushUndo } = useUndo();
  const [targetType, setTargetType] = useState<TargetType>("project");
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetId, setTargetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Project[]>("/projects").catch(() => []),
      api.get<Department[]>("/departments").catch(() => []),
    ])
      .then(([p, d]) => {
        setProjects(p);
        setDepartments(d);
      })
      .finally(() => setLoading(false));
  }, []);

  /**
   * Seçimin ortak kapsamı. Kapsam anahtarı proje varsa proje, yoksa departman —
   * departman altındaki bir projede görevin iki alanı da dolu olabiliyor ama
   * belirleyici olan proje.
   */
  const scopeKeys = new Set((scopeTasks ?? []).map((t) => t.projectId ?? t.departmentId ?? ""));
  const scopeProjectId = scopeKeys.size === 1 ? scopeTasks?.[0]?.projectId : undefined;
  const scopeDepartmentId =
    scopeKeys.size === 1 && !scopeProjectId ? scopeTasks?.[0]?.departmentId : undefined;

  useEffect(() => {
    const path = scopeProjectId
      ? `/projects/${scopeProjectId}/outputs`
      : scopeDepartmentId
        ? `/departments/${scopeDepartmentId}/outputs`
        : null;
    if (!path) return;
    api
      .get<Output[]>(path)
      .then(setOutputs)
      .catch(() => setOutputs([]));
  }, [scopeProjectId, scopeDepartmentId]);

  useEffect(() => {
    setTargetId("");
    setError("");
  }, [targetType]);

  const options = targetType === "project" ? projects : departments;
  // Çıktı sekmesi yalnızca gerçekten çıktı varsa: boş bir sekme sunmak
  // "buraya taşıyabilirim" izlenimi verip kullanıcıyı boşa uğraştırıyor.
  const canTargetOutput = outputs.length > 0;

  const handleSave = async () => {
    if (targetType === "output") {
      await saveOutput();
      return;
    }
    if (!targetId) {
      setError(targetType === "project" ? "Bir proje seç" : "Bir departman seç");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const moved = await api.patch<Task[]>("/tasks/move", {
        ids: taskIds,
        projectId: targetType === "project" ? targetId : undefined,
        departmentId: targetType === "department" ? targetId : undefined,
      });
      onMoved(moved, targetType);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görev taşınamadı");
      setSaving(false);
    }
  };

  /**
   * Çıktıya taşıma projeyi/departmanı DEĞİŞTİRMEZ, yalnızca görevin hangi teslim
   * parçasına ait olduğunu yazar. Bu yüzden ayrı bir uç nokta kullanıyor.
   * Boş seçim "çıktıdan çıkar" demek.
   */
  const saveOutput = async () => {
    setError("");
    setSaving(true);
    const previous = new Map<string, string | null>(
      (scopeTasks ?? []).map((task) => [task.id, task.outputId ?? null])
    );
    const nextId = targetId || null;

    try {
      const moved = await api.patch<Task[]>("/tasks/bulk-output", { ids: taskIds, outputId: nextId });
      pushUndo({
        label: nextId ? "Görevler çıktıya taşındı" : "Görevler çıktıdan çıkarıldı",
        // Her kayıt KENDİ eski çıktısına döner; seçim farklı çıktılardan gelmiş olabilir.
        run: async () => {
          const groups = new Map<string | null, string[]>();
          for (const id of taskIds) {
            const before = previous.get(id) ?? null;
            groups.set(before, [...(groups.get(before) ?? []), id]);
          }
          for (const [before, ids] of groups) {
            await api.patch("/tasks/bulk-output", { ids, outputId: before });
          }
        },
        redo: async () => {
          await api.patch("/tasks/bulk-output", { ids: taskIds, outputId: nextId });
        },
      });
      onMoved(moved, "output");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görevler çıktıya taşınamadı");
      setSaving(false);
    }
  };

  return (
    <Modal title={t("Görevi taşı")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {taskIds.length > 1 ? `${taskIds.length} görev` : "Görev"} seçtiğin hedefe taşınacak (varsa alt görevleriyle birlikte).
        </p>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setTargetType("project")}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: `1.5px solid ${targetType === "project" ? c.primary : c.border}`,
              background: targetType === "project" ? c.background : "transparent",
              color: c.textPrimary,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {t("Proje")}
          </button>
          <button
            type="button"
            onClick={() => setTargetType("department")}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: `1.5px solid ${targetType === "department" ? c.primary : c.border}`,
              background: targetType === "department" ? c.background : "transparent",
              color: c.textPrimary,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {t("Departman")}
          </button>
          {canTargetOutput && (
            <button
              type="button"
              onClick={() => setTargetType("output")}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: `1.5px solid ${targetType === "output" ? c.primary : c.border}`,
                background: targetType === "output" ? c.background : "transparent",
                color: c.textPrimary,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {t("Çıktı")}
            </button>
          )}
        </div>

        {targetType === "output" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Hedef çıktı")}</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: "100%" }}>
              <option value="">{t("Çıktıdan çıkar")}</option>
              {outputs.map((output) => (
                <option key={output.id} value={output.id}>
                  {output.title}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12.5, color: c.textSecondary, margin: 0, lineHeight: 1.45 }}>
              Görevler projede kalır; yalnızca hangi çıktıya ait oldukları değişir.
            </p>
          </div>
        ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>
            {targetType === "project" ? "Hedef proje" : "Hedef departman"}
          </label>
          {loading ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
          ) : options.length === 0 ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
              {targetType === "project" ? "Erişebildiğin proje yok." : "Erişebildiğin departman yok."}
            </p>
          ) : (
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: "100%" }}>
              <option value="">{t("Seç…")}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {targetType === "project" ? (o as Project).title : (o as Department).name}
                </option>
              ))}
            </select>
          )}
        </div>
        )}

        {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

        <button
          data-primary
          onClick={handleSave}
          disabled={saving || !targetId}
          style={{
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: c.onPrimary,
            fontSize: 15,
            fontWeight: 500,
            opacity: !targetId ? 0.6 : 1,
          }}
        >
          {saving ? "Taşınıyor…" : "Taşı"}
        </button>
      </div>
    </Modal>
  );
}
