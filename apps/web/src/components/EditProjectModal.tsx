import { useState } from "react";
import CoverPicker from "./CoverPicker";
import { useNavigate } from "react-router-dom";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { resizeCoverImage } from "../lib/imageProcessing";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";

interface Props {
  /**
   * Kaydetme bittiğinde çağrılır. Verilmezse sayfa BAŞTAN YÜKLENİR.
   *
   * Eskiden tek yol yeniden yüklemekti: kapak yükledikten sonra tüm sayfa
   * sıfırlanıyor, kullanıcı kaydırma konumunu ve açık sekmesini kaybediyordu —
   * dosya yükledikten sonraki o sarsıntının sebebi buydu. Ebeveyn kendi
   * verisini tazeleyebiliyorsa yenilemeye gerek yok.
   */
  onSaved?: () => void;
  project: Project;
  onClose: () => void;
}

function toDateInputValue(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function EditProjectModal({ project, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const navigate = useNavigate();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? "");
  const [totalBudget, setTotalBudget] = useState(String(project.totalBudget));
  const [startDate, setStartDate] = useState(toDateInputValue(project.startDate));
  const [deadline, setDeadline] = useState(toDateInputValue(project.deadline));
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  // Seçili kapak: yüklenmiş bir URL, "preset:<key>" ya da kapak yok.
  const [coverValue, setCoverValue] = useState<string | undefined>(project.coverImageUrl);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
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
        // Hazır kapak seçimi / kapağı kaldırma doğrudan bu alanla kaydedilir;
        // dosya yüklemesi ayrı uçtan gider. Değişmediyse hiç gönderilmez.
        ...(coverValue !== project.coverImageUrl ? { coverImageUrl: coverValue ?? null } : {}),
      });
      if (coverFile) {
        const resized = await resizeCoverImage(coverFile);
        const formData = new FormData();
        formData.append("file", resized);
        await api.uploadFile(`/projects/${project.id}/cover`, formData);
      }
      if (onSaved) {
        onSaved();
        onClose();
      } else {
        window.location.reload();
      }
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
          <label style={{ fontSize: 15, color: c.textSecondary }}>Anlaşılan ücret (₺)</label>
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
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <CoverPicker
          value={coverValue}
          seed={project.id}
          filePreview={coverPreview}
          onSelectPreset={setCoverValue}
          onFile={handleCoverChange}
        />

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>

      <EntityDangerZone
        entityLabel="Projeyi"
        resourcePath={`/projects/${project.id}`}
        onArchive={handleArchive}
        onDelete={handleDelete}
        archiveMessage={`"${project.title}" projesini arşive eklemek istediğine emin misin? Bu projeye bağlı tüm görevler, alt görevler ve çıktılar da arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`}
        deleteMessage={`"${project.title}" projesini silmek istediğine emin misin? Bu projeye bağlı tüm görevler ve alt görevler de silinecek. Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
