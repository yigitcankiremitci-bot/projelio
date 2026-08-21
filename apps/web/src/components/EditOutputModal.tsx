import { useState } from "react";
import type { Output } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";

interface Props {
  output: Output;
  onClose: () => void;
  onSaved: (updated: Output) => void;
  onDeleted?: (deletedOutputId: string) => void;
  onArchived?: (archivedOutputId: string) => void;
}

export default function EditOutputModal({ output, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = useThemeColors();
  const [title, setTitle] = useState(output.title);
  const [description, setDescription] = useState(output.description ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    onDeleted?.(output.id);
  };

  const handleArchive = async () => {
    await api.patch(`/outputs/${output.id}/archive`, {});
    onArchived?.(output.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Açıklama tamamen silinmek istendiğinde null gönderiyoruz: "undefined"
      // JSON'a hiç yazılmadığı için sunucu alanı güncellemiyor ve eski açıklama
      // geri geliyordu (açıklama temizlenemiyor hatası).
      const updated = await api.patch<Output>(`/outputs/${output.id}`, {
        title,
        description: description.trim() ? description : null,
      });
      onSaved(updated);
      onClose();
    } catch {
      setError("Çıktı güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Çıktıyı düzenle" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus style={{ width: "100%" }} />
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
        entityLabel="Çıktıyı"
        resourcePath={`/outputs/${output.id}`}
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={`"${output.title}" çıktısını arşive eklemek istediğine emin misin? Bu çıktıya bağlı görevler etkilenmez. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`}
        deleteMessage={`"${output.title}" çıktısını silmek istediğine emin misin? Bu çıktıya bağlı görevler silinmez, sadece çıktıdan ayrılır. Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
