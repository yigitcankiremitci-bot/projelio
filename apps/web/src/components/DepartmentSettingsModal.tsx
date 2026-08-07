import { useState } from "react";
import type { Department } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";
import type { DepartmentTab } from "./DepartmentTabs";

interface Props {
  department: Department;
  onClose: () => void;
  onSaved: (updated: Department) => void;
  onDeleted?: () => void;
  onArchived?: () => void;
}

const TAB_OPTIONS: { key: DepartmentTab; label: string }[] = [
  { key: "flow", label: "Sosyal" },
  { key: "team", label: "Ekip" },
  { key: "tasks", label: "Görevler" },
  { key: "budget", label: "Bütçe" },
  { key: "modules", label: "Modüller" },
  { key: "files", label: "Dosyalar" },
];

// Departman sayfası her açıldığında hangi sekmenin gelmesini istediğini
// organizasyon sahibi burada seçer. Varsayılan "Görevler" — departman
// kurulduğunda hiç değiştirilmemişse öyle açılır.
export default function DepartmentSettingsModal({ department, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = colors.light;
  const [defaultTab, setDefaultTab] = useState<DepartmentTab>((department.defaultTab as DepartmentTab) || "tasks");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const updated = await api.patch<Department>(`/departments/${department.id}`, { defaultTab });
      onSaved(updated);
    } catch {
      setError("Kaydedilemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    onDeleted?.();
  };

  const handleArchive = async () => {
    await api.patch(`/departments/${department.id}/archive`, {});
    onArchived?.();
  };

  return (
    <Modal title="Departman ayarları" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açılış sekmesi</label>
          <select
            value={defaultTab}
            onChange={(e) => setDefaultTab(e.target.value as DepartmentTab)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              fontSize: 16,
              color: c.textPrimary,
              background: c.surface,
            }}
          >
            {TAB_OPTIONS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
            Bu departman sayfası her açıldığında seçtiğin sekmeyle başlar.
          </p>
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 4,
            background: c.primary,
            color: "#fff",
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            fontSize: 17,
            fontWeight: 500,
          }}
        >
          {loading ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>

      <EntityDangerZone
        entityLabel="Departmanı"
        resourcePath={`/departments/${department.id}`}
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={`"${department.name}" departmanını arşive eklemek istediğine emin misin? Departman, organizasyonun departman listesinden kaldırılır; ekip, görevler ve dosyalar korunur.`}
        deleteMessage={`"${department.name}" departmanını silmek istediğine emin misin? Departmana ait ekip, görevler, dosyalar ve akış paylaşımları da birlikte silinir. Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
