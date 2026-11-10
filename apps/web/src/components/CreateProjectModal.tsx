import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project, ProjeSablonu } from "@projelio/shared";
import SablonSecici from "./projeler/SablonSecici";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { notifyCreationRequestsChanged, readCreateOutcome } from "../lib/creationRequests";
import Modal from "./Modal";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { useT } from "../lib/i18n";

interface Props {
  jobId: string;
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateProjectModal({ jobId, onClose, onCreated }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Taşeron, sahibi olmadığı işin altına proje açamaz: talep onaya düşer.
  const [sentForApproval, setSentForApproval] = useState(false);
  // Şablondan başlanınca yalnızca ad + başlangıç sorulur; bitiş, görevler,
  // çıktılar ve etkinlikler şablondan gelir (tarihler başlangıca kaydırılır).
  const [seciciAcik, setSeciciAcik] = useState(false);
  const [sablon, setSablon] = useState<ProjeSablonu | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (sablon) {
      try {
        const yeni = await api.post<Project>(`/proje-sablonlari/${encodeURIComponent(sablon.id)}/proje`, { jobId, title, startDate });
        notifySidebarChanged();
        onClose();
        onCreated?.();
        navigate(`/projects/${yeni.id}`);
      } catch (err: any) {
        setError(err?.message || t("Proje oluşturulamadı. Tekrar dene."));
        setLoading(false);
      }
      return;
    }
    try {
      const result = readCreateOutcome(
        await api.post("/projects", {
          jobId,
          title,
          description: description || undefined,
          totalBudget: Number(totalBudget) || 0,
          startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
          deadline: deadline ? new Date(deadline).toISOString() : new Date().toISOString(),
          status: "active",
        })
      );
      if (result.pending) {
        setSentForApproval(true);
        setLoading(false);
        notifyCreationRequestsChanged();
        return;
      }
      notifySidebarChanged();
      onClose();
      if (onCreated) onCreated();
      else window.location.reload();
    } catch {
      setError(t("Proje oluşturulamadı. Tekrar dene."));
      setLoading(false);
    }
  };

  if (sentForApproval) {
    return (
      <Modal title={t("Onaya gönderildi")} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 16, color: c.textPrimary, margin: 0, lineHeight: 1.5 }}>
            <strong>{title}</strong> {t("talebiniz işin sahibine iletildi. Onaylandığında bildirim alacak ve proje listenizde göreceksiniz.")}
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{ background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
          >
            {t("Tamam")}
          </button>
        </div>
      </Modal>
    );
  }

  if (seciciAcik) {
    return (
      <SablonSecici
        onClose={() => setSeciciAcik(false)}
        onSec={(s) => {
          setSablon(s);
          if (!title) setTitle(s.ad);
          setSeciciAcik(false);
        }}
      />
    );
  }

  return (
    <Modal title={t("Yeni proje")} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sablon ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: c.textPrimary }}>
              {t("Şablon:")} <strong>{sablon.ad}</strong>
            </span>
            <button type="button" onClick={() => setSeciciAcik(true)} style={{ background: "none", border: "none", color: c.primary, fontSize: 14, cursor: "pointer" }}>
              {t("Değiştir")}
            </button>
            <button type="button" onClick={() => setSablon(null)} style={{ background: "none", border: "none", color: c.textSecondary, fontSize: 14, cursor: "pointer" }}>
              {t("Kaldır")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSeciciAcik(true)}
            style={{ background: "none", border: `1px dashed ${c.border}`, borderRadius: 10, padding: "10px 12px", color: c.primary, fontSize: 15, cursor: "pointer", textAlign: "left" }}
          >
            {t("Şablondan başla…")}
          </button>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Başlık")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={t("Marka yenileme")} style={{ width: "100%" }} />
        </div>

        {!sablon && (<>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Açıklama")}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Kısa açıklama (opsiyonel)")} style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Anlaşılan ücret (₺)")}</label>
          <input type="number" min={0} value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} placeholder="0" style={{ width: "100%" }} />
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            {t("Müşteriden tahsil edeceğin toplam tutar. Aldığın ödemeler bundan düşülür.")}
          </span>
        </div>
        </>)}

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Başlangıç tarihi")}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={{ width: "100%" }} />
          </div>
          {!sablon && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Bitiş tarihi")}</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ width: "100%" }} />
          </div>
          )}
        </div>

        {sablon && (
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            {t("Bitiş tarihi, görevler ve etkinlikler şablondan gelir; tarihler başlangıca göre kaydırılır.")}
          </span>
        )}

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? t("Oluşturuluyor…") : t("Proje oluştur")}
        </button>
      </form>
    </Modal>
  );
}
