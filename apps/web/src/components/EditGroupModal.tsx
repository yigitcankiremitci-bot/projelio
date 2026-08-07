import { useState } from "react";
import type { Group } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { resizeCoverImage } from "../lib/imageProcessing";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";

interface Props {
  group: Group;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  onArchived?: () => void;
}

export default function EditGroupModal({ group, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = colors.light;
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    onDeleted?.();
  };

  const handleArchive = async () => {
    await api.patch(`/groups/${group.id}/archive`, {});
    onArchived?.();
  };

  const handleCoverChange = (file: File | null) => {
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.patch(`/groups/${group.id}`, { name, description: description || undefined });
      if (coverFile) {
        const resized = await resizeCoverImage(coverFile);
        const formData = new FormData();
        formData.append("file", resized);
        await api.uploadFile(`/groups/${group.id}/cover`, formData);
      }
      onSaved();
      onClose();
    } catch {
      setError("Grup güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Grubu düzenle" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Ad</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kısa açıklama (opsiyonel)"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Kapak fotoğrafı</label>
          {(coverPreview || group.coverImageUrl) && (
            <div style={{ height: 90, borderRadius: 8, background: `center/cover url(${coverPreview ?? group.coverImageUrl})` }} />
          )}
          <input type="file" accept="image/*" onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)} />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>

      <EntityDangerZone
        entityLabel="Grubu"
        resourcePath={`/groups/${group.id}`}
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={`"${group.name}" grubunu arşive eklemek istediğine emin misin? Bu gruba bağlı tüm organizasyonlar ve projeler de arşive taşınır.`}
        deleteMessage={`"${group.name}" grubunu silmek istediğine emin misin? Bu gruba bağlı organizasyon/proje bağlantıları kaldırılır (kendileri silinmez). Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
