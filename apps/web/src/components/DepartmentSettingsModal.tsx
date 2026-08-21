import { useRef, useState } from "react";
import type { Department } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { resizeCoverImage } from "../lib/imageProcessing";
import { getDepartmentCoverUrl, hasCustomDepartmentCover } from "../lib/departmentCovers";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";
import type { DepartmentTab } from "./DepartmentTabs";

interface Props {
  department: Department;
  onClose: () => void;
  onSaved: (updated: Department) => void;
  /**
   * Kapak anında kaydedilir (ayrı bir uçtan), "Kaydet"i beklemez — bu yüzden
   * onSaved değil bu geri çağrı kullanılır: sayfa tazelenir, modal açık kalır.
   */
  onCoverChanged?: (updated: Department) => void;
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
export default function DepartmentSettingsModal({
  department,
  onClose,
  onSaved,
  onCoverChanged,
  onDeleted,
  onArchived,
}: Props) {
  const c = useThemeColors();
  const [defaultTab, setDefaultTab] = useState<DepartmentTab>((department.defaultTab as DepartmentTab) || "tasks");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Kapak, sayfa başlığındaki kalem simgesi yerine artık buradan yönetiliyor:
  // başlıkta iki ayrı düzenleme girişi (dişli + kalem) olması hangisinin neyi
  // açtığını belirsiz kılıyordu.
  const [current, setCurrent] = useState(department);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const coverUrl = getDepartmentCoverUrl(current);
  const isCustomCover = hasCustomDepartmentCover(current);

  const applyCover = (updated: Department) => {
    setCurrent(updated);
    onCoverChanged?.(updated);
  };

  const handleCoverSelected = async (file: File | null) => {
    if (!file) return;
    setCoverBusy(true);
    setCoverError("");
    try {
      const resized = await resizeCoverImage(file);
      const formData = new FormData();
      formData.append("file", resized);
      applyCover(await api.uploadFile<Department>(`/departments/${department.id}/cover`, formData));
    } catch {
      setCoverError("Kapak yüklenemedi. Tekrar dene.");
    } finally {
      setCoverBusy(false);
    }
  };

  const handleRemoveCover = async () => {
    setCoverBusy(true);
    setCoverError("");
    try {
      applyCover(await api.delete<Department>(`/departments/${department.id}/cover`));
    } catch {
      setCoverError("Kapak kaldırılamadı. Tekrar dene.");
    } finally {
      setCoverBusy(false);
    }
  };

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
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <label style={{ fontSize: 15, color: c.textSecondary }}>Kapak</label>
        <div
          style={{
            height: 90,
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: coverUrl ? `center/cover no-repeat url(${coverUrl})` : c.background,
            display: coverUrl ? undefined : "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: c.textSecondary,
            opacity: coverBusy ? 0.6 : 1,
          }}
        >
          {!coverUrl && "Kapak yok"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={coverBusy}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              fontSize: 15,
            }}
          >
            {coverBusy ? "Yükleniyor…" : "Fotoğraf yükle"}
          </button>
          {/* Yalnızca kullanıcının yüklediği bir kapak varsa: katalog departmanları
              kaldırıldığında kendi varsayılan fotoğrafına döner. */}
          {isCustomCover && (
            <button
              type="button"
              onClick={handleRemoveCover}
              disabled={coverBusy}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.textSecondary,
                fontSize: 15,
              }}
            >
              Varsayılana dön
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            void handleCoverSelected(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
        {coverError && <p style={{ color: c.danger, fontSize: 15, margin: 0 }}>{coverError}</p>}
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          Kapak seçtiğin anda kaydedilir; "Kaydet"i beklemez.
        </p>
      </div>

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
