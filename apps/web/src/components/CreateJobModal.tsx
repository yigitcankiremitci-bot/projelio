import { useState } from "react";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { notifyCreationRequestsChanged, readCreateOutcome } from "../lib/creationRequests";
import Modal from "./Modal";

interface Props {
  onClose: () => void;
  onCreated?: () => void;
}

// "İş" (job) yalnızca serbest çalışan/taşeron çalışma biçimine özgüdür — bir
// organizasyona/gruba bağlanamaz. Şirket/işletme/holding içi çalışma Departmanlar
// üzerinden yürütülür (bkz. DepartmentsPanel).
export default function CreateJobModal({ onClose, onCreated }: Props) {
  const c = colors.light;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Taşeronun organizasyona bağlı iş talebi onaya düşer; kayıt o an açılmaz.
  const [sentForApproval, setSentForApproval] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = readCreateOutcome(
        await api.post("/jobs", { title, description: description || undefined })
      );
      if (result.pending) {
        // Kayıt açılmadı: yetkiliye bildirim gitti. Modalı kapatmıyoruz —
        // kullanıcı "oluştu" sanıp listede aramasın.
        setSentForApproval(true);
        setLoading(false);
        notifyCreationRequestsChanged();
        return;
      }
      onClose();
      if (onCreated) onCreated();
      else window.location.reload();
    } catch {
      setError("İş oluşturulamadı. Tekrar dene.");
      setLoading(false);
    }
  };

  if (sentForApproval) {
    return (
      <Modal title="Onaya gönderildi" onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 16, color: c.textPrimary, margin: 0, lineHeight: 1.5 }}>
            <strong>{title}</strong> talebiniz yetkiliye iletildi. Onaylandığında bildirim alacak
            ve iş listenizde göreceksiniz.
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{ background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
          >
            Tamam
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Yeni iş" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Örn. Web tasarım işleri" style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kısa açıklama (opsiyonel)" style={{ width: "100%" }} />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Oluşturuluyor…" : "İş oluştur"}
        </button>
      </form>
    </Modal>
  );
}
