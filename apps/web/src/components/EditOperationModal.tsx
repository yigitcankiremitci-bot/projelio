import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Operation, OperationBudgetPeriod } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { resizeCoverImage } from "../lib/imageProcessing";
import CoverPicker from "./CoverPicker";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";

interface Props {
  /**
   * Kaydetme bittiğinde çağrılır. Verilmezse sayfa baştan yüklenir.
   * (Gerekçesi EditProjectModal'daki aynı alanla ortak: kapak yükledikten sonra
   * tüm sayfanın sıfırlanması kaydırma konumunu ve açık sekmeyi kaybettiriyordu.)
   */
  onSaved?: () => void;
  operation: Operation;
  onClose: () => void;
}

const periods: { value: OperationBudgetPeriod; label: string }[] = [
  { value: "weekly", label: "Haftalık" },
  { value: "monthly", label: "Aylık" },
  { value: "yearly", label: "Yıllık" },
];

/**
 * Rutinin (eski adıyla "program") kendi bilgilerini düzenler.
 *
 * Sunucu tarafı bu alanları en baştan güncelleyebiliyordu (PATCH /operations/:id),
 * ama arayüzde yalnızca oluşturma formu vardı: bir rutin kurulduktan sonra adı,
 * açıklaması, dönemsel ücreti ya da başlangıç tarihi hiçbir yerden değiştirilemiyordu.
 * Durum (aktif/duraklat/kapat) burada değil, sayfadaki düğmelerde kalır — kapatma
 * bitiş tarihi sorduğu için ayrı bir akış.
 */
export default function EditOperationModal({ operation, onClose, onSaved}: Props) {
  const c = useThemeColors();
  const navigate = useNavigate();
  const [title, setTitle] = useState(operation.title);
  const [description, setDescription] = useState(operation.description ?? "");
  const [budgetPerPeriod, setBudgetPerPeriod] = useState(String(operation.budgetPerPeriod));
  const [budgetPeriod, setBudgetPeriod] = useState<OperationBudgetPeriod>(operation.budgetPeriod);
  const [startedOn, setStartedOn] = useState(operation.startedOn.slice(0, 10));
  // Seçili kapak: yüklenmiş bir URL, "preset:<key>" ya da kapak yok.
  const [coverValue, setCoverValue] = useState<string | undefined>(operation.coverImageUrl);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    navigate(`/jobs/${operation.jobId}?tab=programs`);
  };

  const handleArchive = async () => {
    await api.patch(`/operations/${operation.id}/archive`, {});
    navigate(`/jobs/${operation.jobId}?tab=programs`);
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
      await api.patch(`/operations/${operation.id}`, {
        title,
        description: description || undefined,
        budgetPerPeriod: Number(budgetPerPeriod) || 0,
        budgetPeriod,
        startedOn: new Date(startedOn).toISOString(),
        // Hazır kapak seçimi / kapağı kaldırma doğrudan bu alanla kaydedilir;
        // dosya yüklemesi ayrı uçtan gider. Değişmediyse hiç gönderilmez.
        ...(coverValue !== operation.coverImageUrl ? { coverImageUrl: coverValue ?? null } : {}),
      });
      if (coverFile) {
        const resized = await resizeCoverImage(coverFile);
        const formData = new FormData();
        formData.append("file", resized);
        await api.uploadFile(`/operations/${operation.id}/cover`, formData);
      }
      if (onSaved) {
        onSaved();
        onClose();
      } else {
        window.location.reload();
      }
    } catch {
      setError("Rutin güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Rutini düzenle" onClose={onClose}>
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

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 2 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Dönemsel ücret (₺)</label>
            <input
              type="number"
              min={0}
              value={budgetPerPeriod}
              onChange={(e) => setBudgetPerPeriod(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Dönem</label>
            <select
              value={budgetPeriod}
              onChange={(e) => setBudgetPeriod(e.target.value as OperationBudgetPeriod)}
              style={{ width: "100%" }}
            >
              {periods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlangıç tarihi</label>
          <input
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>

        <CoverPicker
          value={coverValue}
          filePreview={coverPreview}
          onSelectPreset={setCoverValue}
          onFile={handleCoverChange}
        />

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
        entityLabel="Rutini"
        resourcePath={`/operations/${operation.id}`}
        onArchive={handleArchive}
        onDelete={handleDelete}
        archiveMessage={`"${operation.title}" rutinini arşive eklemek istediğine emin misin? Rutine bağlı tekrar kuralları ve açılmış görevler de arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`}
        deleteMessage={`"${operation.title}" rutinini silmek istediğine emin misin? Rutine bağlı tüm tekrar kuralları ve açılmış görevler de silinecek. Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
