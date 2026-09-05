import { useState } from "react";
import type { Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { useUndo } from "../lib/undo";
import { IconIndent, IconOutdent } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  /** Kapsamdaki TÜM görevler: adaylar ve "alt görevi var mı" bilgisi buradan çıkar. */
  tasks: Task[];
  selectedIds: Set<string>;
  onClose: () => void;
  /**
   * Güncellenen kayıtlarla birlikte çağrılır; liste tazeleme ve seçimi temizleme
   * çağıranın işi. Panolar birbirinden farklı tazeleniyor (kimi tam yeniden
   * yükleme, kimi yerel durum yaması), o yüzden karar burada verilmiyor.
   */
  onDone: (updated: Task[]) => void;
}

interface SkippedItem {
  id: string;
  title: string;
  reason: string;
}

/**
 * Seçili görev/alt görevleri TOPLU olarak bir seviye yukarı ya da aşağı alır.
 *
 * Seçim genellikle KARIŞIK oluyor: bir kısmı zaten alt görev, bir kısmının kendi
 * alt görevleri var. Bu yüzden pencere önce seçimi ayrıştırıp "kaç kayıt neyi
 * yapabilir" diye gösteriyor, sonra ilgili kayıtlara işlemi uyguluyor. Kurallara
 * takılanlar işlemi düşürmüyor, sonunda sebebiyle listeleniyor — aksi halde
 * kullanıcı hangisinin dönüştüğünü ancak tek tek bakarak anlayabilirdi.
 */
export default function BulkConvertHierarchyModal({ tasks, selectedIds, onClose, onDone }: Props) {
  const c = useThemeColors();
  const t = useT();
  const { pushUndo } = useUndo();
  const [pickingParent, setPickingParent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ updated: Task[]; skipped: SkippedItem[] } | null>(null);

  const selected = tasks.filter((task) => selectedIds.has(task.id));
  const hasSubtasks = (taskId: string) => tasks.some((task) => task.parentTaskId === taskId);

  // Yükseltilebilirler: hâlihazırda alt görev olanlar.
  const promotable = selected.filter((task) => task.parentTaskId);
  // İndirilebilirler: üst seviye olup kendi alt görevi OLMAYANLAR (üçüncü seviye doğmasın).
  const demotable = selected.filter((task) => !task.parentTaskId && !hasSubtasks(task.id));
  const blocked = selected.filter((task) => !task.parentTaskId && hasSubtasks(task.id));

  const run = async (ids: string[], parentTaskId: string | null) => {
    setBusy(true);
    setError(null);

    // Geri alma için ESKİ üst görevler işlemden ÖNCE saklanır: istek dönünce
    // kayıtların önceki hâli sunucuda kalmıyor.
    const previousParents = new Map<string, string | null>(
      ids.map((id) => [id, tasks.find((task) => task.id === id)?.parentTaskId ?? null])
    );

    try {
      const response = await api.patch<{ updated: Task[]; skipped: SkippedItem[] }>(
        "/tasks/bulk-hierarchy",
        { ids, parentTaskId }
      );

      if (response.updated.length) {
        const changedIds = response.updated.map((task) => task.id);
        pushUndo({
          label: parentTaskId
            ? `${changedIds.length} görev alt göreve alındı`
            : `${changedIds.length} alt görev göreve dönüştürüldü`,
          // Geri alma, kayıtları ESKİ üst görevlerine döndürür. Yükseltmede her
          // kaydın üst görevi farklı olabildiği için önce gruplanıp her grup
          // tek istekte geri alınıyor.
          run: async () => {
            const groups = new Map<string | null, string[]>();
            for (const id of changedIds) {
              const previous = previousParents.get(id) ?? null;
              groups.set(previous, [...(groups.get(previous) ?? []), id]);
            }
            for (const [previous, groupIds] of groups) {
              await api.patch("/tasks/bulk-hierarchy", { ids: groupIds, parentTaskId: previous });
            }
          },
          redo: async () => {
            await api.patch("/tasks/bulk-hierarchy", { ids: changedIds, parentTaskId });
          },
        });
      }
      // Atlanan varsa pencere açık kalır: kullanıcı neyin neden olmadığını görsün.
      if (response.skipped?.length) {
        setResult(response);
        setBusy(false);
        return;
      }
      onDone(response.updated);
    } catch (err: any) {
      setError(err?.message ?? "Dönüştürme başarısız oldu.");
      setBusy(false);
    }
  };

  if (result) {
    const finish = () => onDone(result.updated);
    return (
      <Modal title={t("Dönüştürme tamamlandı")} onClose={finish}>
        <p style={{ fontSize: 15, color: c.textPrimary, margin: "0 0 12px" }}>
          {result.updated.length} kayıt dönüştürüldü, {result.skipped.length} kayıt dönüştürülemedi:
        </p>
        <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 14, color: c.textSecondary, lineHeight: 1.6 }}>
          {result.skipped.map((item) => (
            <li key={item.id}>
              <strong style={{ color: c.textPrimary }}>{item.title}</strong> — {item.reason}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            data-primary
            onClick={finish}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {t("Tamam")}
          </button>
        </div>
      </Modal>
    );
  }

  if (pickingParent) {
    // Seçilenler hedef olamaz: kendi altına ya da birlikte indirilen bir kaydın
    // altına almak, seçimin yarısını kayıp gösterirdi.
    const candidates = tasks.filter((task) => !task.parentTaskId && !selectedIds.has(task.id));
    return (
      <Modal title={t("Hangi görevin altına girsinler?")} onClose={() => setPickingParent(false)}>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px" }}>
          {demotable.length} görev seçtiğin görevin alt görevi olacak.
        </p>
        {candidates.length === 0 ? (
          <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
            {t("Alt görev yapılabileceği başka bir görev yok.")}
          </p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 10 }}>
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => void run(demotable.map((task) => task.id), candidate.id)}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${c.border}`,
                  textAlign: "left",
                  fontSize: 14,
                  color: c.textPrimary,
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {candidate.title}
              </button>
            ))}
          </div>
        )}
        {error && <p style={{ color: c.danger, fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal title={t("Seviye dönüştür")} onClose={onClose}>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 14px", lineHeight: 1.5 }}>
        {selected.length} kayıt seçili.
        {blocked.length > 0 &&
          ` ${blocked.length} tanesinin kendi alt görevleri var, onlar alt göreve dönüştürülemez.`}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ActionRow
          icon={<IconOutdent size={16} color={c.textSecondary} />}
          label={t("Göreve dönüştür")}
          detail={promotable.length > 0 ? `${promotable.length} alt görev üst seviyeye çıkar` : "Seçimde alt görev yok"}
          disabled={busy || promotable.length === 0}
          onClick={() => void run(promotable.map((task) => task.id), null)}
        />
        <ActionRow
          icon={<IconIndent size={16} color={c.textSecondary} />}
          label={t("Alt göreve dönüştür")}
          detail={demotable.length > 0 ? `${demotable.length} görev seçilecek bir görevin altına iner` : "Uygun görev yok"}
          disabled={busy || demotable.length === 0}
          onClick={() => setPickingParent(true)}
        />
      </div>

      {error && <p style={{ color: c.danger, fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  detail,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const c = useThemeColors();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: "transparent",
        textAlign: "left",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14, color: c.textPrimary }}>{label}</span>
        <span style={{ fontSize: 12, color: c.textSecondary }}>{detail}</span>
      </span>
    </button>
  );
}
