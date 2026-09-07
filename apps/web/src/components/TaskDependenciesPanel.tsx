import { useEffect, useState } from "react";
import type { Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { IconCheck, IconPlus, IconX } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  task: Task;
  /** Sunucudan dönen güncel görev — kart rozeti hemen tazelensin. */
  onChanged: (updated: Task) => void;
}

/**
 * "Bu görev şunlar bitmeden başlayamaz" listesi (bkz. migration 094).
 *
 * NEDEN ALT GÖREV YERİNE AYRI BİR KAVRAM: alt görev "parçası", bağımlılık
 * "önce gelen" demek. Kapak tasarımı onaylanmadan baskıya gidilemez ama baskı,
 * onayın bir parçası değil — üstelik ikisi ayrı projelerde bile olabilir.
 *
 * Aday listesi görevin kendi kapsamından (proje ya da departman) geliyor ve
 * yalnızca AÇILDIĞINDA çekiliyor: görev düzenleme penceresi zaten yorum, dosya
 * ve ek listeleri yüklüyor, kimsenin kullanmadığı bir listeyi de her açılışta
 * çekmenin anlamı yok.
 */
export default function TaskDependenciesPanel({ task, onChanged }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [dependsOn, setDependsOn] = useState<string[]>(task.dependsOn ?? []);
  const [candidates, setCandidates] = useState<Task[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Görev değişirse (modal başka bir kayıtla yeniden kullanılırsa) liste de değişsin.
  useEffect(() => setDependsOn(task.dependsOn ?? []), [task.id, task.dependsOn]);

  const scopePath = task.projectId
    ? `/projects/${task.projectId}/tasks`
    : task.departmentId
      ? `/departments/${task.departmentId}/tasks`
      : null;

  const openPicker = async () => {
    setError("");
    setPicking(true);
    if (candidates || !scopePath) return;
    try {
      setCandidates(await api.get<Task[]>(scopePath));
    } catch (err: any) {
      setError(err?.message ?? t("Görev listesi alınamadı."));
    }
  };

  const titleOf = (id: string) =>
    candidates?.find((aday) => aday.id === id)?.title ?? t("Görev");

  // Başlıkları gösterebilmek için: bağımlılık VARSA liste sessizce çekilir.
  // Seçici açılmasa da satırlarda "Görev" yazmasın.
  useEffect(() => {
    if (candidates || dependsOn.length === 0 || !scopePath) return;
    api.get<Task[]>(scopePath).then(setCandidates).catch(() => {});
  }, [dependsOn.length, scopePath, candidates]);

  const add = async (dependsOnTaskId: string) => {
    setBusy(true);
    setError("");
    try {
      const updated = await api.post<Task>(`/tasks/${task.id}/dependencies`, { dependsOnTaskId });
      setDependsOn(updated.dependsOn ?? []);
      onChanged(updated);
      setPicking(false);
    } catch (err: any) {
      setError(err?.message ?? t("Bağımlılık eklenemedi."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (dependsOnTaskId: string) => {
    setBusy(true);
    setError("");
    try {
      const updated = await api.delete<Task>(`/tasks/${task.id}/dependencies/${dependsOnTaskId}`);
      setDependsOn(updated.dependsOn ?? []);
      onChanged(updated);
    } catch (err: any) {
      setError(err?.message ?? t("Bağımlılık kaldırılamadı."));
    } finally {
      setBusy(false);
    }
  };

  // Aday olmayanlar: görevin kendisi, hâlihazırda bağlı olanlar ve görevin kendi
  // alt görevleri (bir görev kendi parçasını bekleyemez — parçalar bitmeden
  // görev zaten bitmiş sayılmıyor).
  const secilebilir = (candidates ?? []).filter(
    (aday) =>
      aday.id !== task.id &&
      aday.parentTaskId !== task.id &&
      !dependsOn.includes(aday.id) &&
      !aday.archivedAt
  );

  const satirStili = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.background,
    fontSize: 15,
  } as const;

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>
        {t("Bağımlılıklar")}
      </h3>
      <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 10px" }}>
        {t("Buraya eklenen görevler bitmeden bu görev başlatılamaz.")}
      </p>

      {dependsOn.length === 0 ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 10px" }}>
          {t("Bu görev başka bir görevi beklemiyor.")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {dependsOn.map((id) => {
            const beklenen = candidates?.find((aday) => aday.id === id);
            const bitti = beklenen?.status === "completed";
            return (
              <div key={id} style={satirStili}>
                {/* Tamamlanan bağımlılık artık engel değil: yeşil onay işareti,
                    "bunu beklemiyorum artık" demenin en kısa yolu. */}
                <span style={{ display: "flex", flexShrink: 0 }}>
                  {bitti ? (
                    <IconCheck size={14} color={c.success} />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: c.warning,
                        display: "inline-block",
                      }}
                    />
                  )}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: bitti ? c.success : c.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {titleOf(id)}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(id)}
                  disabled={busy}
                  aria-label={t("Bağımlılığı kaldır")}
                  style={{ background: "transparent", border: "none", padding: 2, display: "flex", flexShrink: 0 }}
                >
                  <IconX size={14} color={c.textSecondary} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!scopePath ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          {t("Bu görevin bağlı olduğu bir proje ya da departman yok; bağımlılık kurulamaz.")}
        </p>
      ) : picking ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            defaultValue=""
            disabled={busy || !candidates}
            onChange={(e) => e.target.value && void add(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          >
            <option value="" disabled>
              {candidates ? t("Beklenecek görevi seç…") : t("Yükleniyor…")}
            </option>
            {secilebilir.map((aday) => (
              <option key={aday.id} value={aday.id}>
                {aday.parentTaskId ? "↳ " : ""}
                {aday.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPicking(false)}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textSecondary,
              fontSize: 14,
            }}
          >
            {t("Vazgeç")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void openPicker()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 14,
          }}
        >
          <IconPlus size={14} color={c.textSecondary} />
          {t("Bağımlılık ekle")}
        </button>
      )}

      {error && <p style={{ color: c.danger, fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
