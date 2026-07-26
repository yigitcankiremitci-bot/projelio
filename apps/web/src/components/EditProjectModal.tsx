import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project, ProjectStatus } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { resizeCoverImage } from "../lib/imageProcessing";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";

interface Props {
  project: Project;
  onClose: () => void;
}

const statusOptions: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Aktif" },
  { value: "completed", label: "Tamamlandı" },
  { value: "archived", label: "Arşivlendi" },
];

function toDateInputValue(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function EditProjectModal({ project, onClose }: Props) {
  const c = colors.light;
  const navigate = useNavigate();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? "");
  const [totalBudget, setTotalBudget] = useState(String(project.totalBudget));
  const [startDate, setStartDate] = useState(toDateInputValue(project.startDate));
  const [deadline, setDeadline] = useState(toDateInputValue(project.deadline));
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    await api.delete(`/projects/${project.id}`);
    navigate(`/jobs/${project.jobId}`);
  };

  const handleArchive = async () => {
    await api.patch(`/projects/${project.id}/archive`, {});
    navigate(`/jobs/${project.jobId}`);
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
      await api.patch(`/projects/${project.id}`, {
        title,
        description: description || undefined,
        totalBudget: Number(totalBudget) || 0,
        startDate: new Date(startDate).toISOString(),
        deadline: new Date(deadline).toISOString(),
        status,
      });
      if (coverFile) {
        const resized = await resizeCoverImage(coverFile);
        const formData = new FormData();
        formData.append("file", resized);
        await api.uploadFile(`/projects/${project.id}/cover`, formData);
      }
      window.location.reload();
    } catch {
      setError("Proje güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Projeyi düzenle" onClose={onClose}>
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
          <label style={{ fontSize: 15, color: c.textSecondary }}>Bütçe (₺)</label>
          <input type="number" min={0} value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Başlangıç tarihi</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bitiş tarihi</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Durum</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} style={{ width: "100%" }}>
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Kapak fotoğrafı</label>
          {(coverPreview || project.coverImageUrl) && (
            <div
              style={{
                height: 90,
                borderRadius: 8,
                background: `center/cover url(${coverPreview ?? project.coverImageUrl})`,
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

      <EntityDangerZone
        entityLabel="Projeyi"
        onArchive={handleArchive}
        onDelete={handleDelete}
        archiveMessage={`"${project.title}" projesini arşive eklemek istediğine emin misin? Bu projeye bağlı tüm görevler, alt görevler ve çıktılar da arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`}
        deleteMessage={`"${project.title}" projesini silmek istediğine emin misin? Bu projeye bağlı tüm görevler ve alt görevler de silinecek. Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
