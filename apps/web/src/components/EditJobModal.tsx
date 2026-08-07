import { useState } from "react";
import type { Job } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { resizeCoverImage } from "../lib/imageProcessing";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";
import HireMemberModal from "./HireMemberModal";
import { IconUser } from "./icons";

interface Props {
  job: Job;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  onArchived?: () => void;
}

// "İş" (job) yalnızca serbest çalışan/taşeron çalışma biçimine özgüdür — bir
// organizasyona/gruba bağlanamaz (bkz. CreateJobModal).
export default function EditJobModal({ job, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = colors.light;
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hiring, setHiring] = useState(false);

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    onDeleted?.();
  };

  const handleArchive = async () => {
    await api.patch(`/jobs/${job.id}/archive`, {});
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
      await api.patch(`/jobs/${job.id}`, {
        title,
        description: description || undefined,
      });
      if (coverFile) {
        const resized = await resizeCoverImage(coverFile);
        const formData = new FormData();
        formData.append("file", resized);
        await api.uploadFile(`/jobs/${job.id}/cover`, formData);
      }
      onSaved();
      onClose();
    } catch {
      setError("İş güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="İşi düzenle" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: "100%" }} />
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
          {(coverPreview || job.coverImageUrl) && (
            <div
              style={{
                height: 90,
                borderRadius: 8,
                background: `center/cover url(${coverPreview ?? job.coverImageUrl})`,
              }}
            />
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

      <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 16, paddingTop: 16 }}>
        <button
          type="button"
          onClick={() => setHiring(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "10px 0",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          <IconUser size={15} color={c.textSecondary} />
          İşe al
        </button>
      </div>

      {hiring && <HireMemberModal jobId={job.id} existingUserIds={[]} onClose={() => setHiring(false)} onHired={() => setHiring(false)} />}

      <EntityDangerZone
        entityLabel="İşi"
        resourcePath={`/jobs/${job.id}`}
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={`"${job.title}" işini arşive eklemek istediğine emin misin? Bu işe bağlı tüm projeler ve görevler de arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`}
        deleteMessage={`"${job.title}" işini silmek istediğine emin misin? Bu işe bağlı tüm projeler ve görevler de silinecek. Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
