import { useState } from "react";
import type { Task } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { todayISO } from "../lib/moduleConfigs";
import AssigneePicker from "./AssigneePicker";
import Modal from "./Modal";

interface Props {
  departmentId: string;
  moduleKey: string;
  moduleTitle: string;
  recordId: string;
  /** Kaydın özeti — görev başlığının varsayılanı. */
  defaultTitle: string;
  /** Kayıttaki tarih (planlanan gün, vade, teslim…) — teslim tarihinin varsayılanı. */
  defaultDeadline?: string;
  /** Bu kayıttan daha önce üretilmiş görev sayısı. */
  existingCount: number;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Modül kaydını göreve dönüştürme.
 *
 * "Modüller birbirini besliyor" ilkesinin çekirdeğe uzanan hali: sosyal medya
 * planı, tedarik talebi ya da kalite uygunsuzluğu girildiğinde iş orada
 * bitmiyor — birinin onu yapması gerekiyor. Bu köprü olmadan kullanıcı aynı
 * cümleyi bir de departman görevlerine elle yazıyordu.
 *
 * Görev departmanın görev listesine düşer ve kaynağını taşır (source_record_id),
 * böylece modül panelinde "bu kayıttan görev üretildi" görünür.
 */
export default function TaskFromRecordModal({
  departmentId,
  moduleKey,
  moduleTitle,
  recordId,
  defaultTitle,
  defaultDeadline,
  existingCount,
  onClose,
  onCreated,
}: Props) {
  const c = colors.light;
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  // Kayıtta tarih varsa onu kullan; yoksa bugün. Boş bırakılan teslim tarihi
  // görevi "ne zaman" sorusu olmayan bir nota çevirirdi.
  const [deadline, setDeadline] = useState(defaultDeadline || todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) {
      setError("Görev başlığı gerekli");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post<Task>(`/departments/${departmentId}/tasks`, {
        title: title.trim(),
        description: description.trim() || `${moduleTitle} kaydından oluşturuldu.`,
        deadline,
        assignedTo: assignedTo || undefined,
        sourceModuleKey: moduleKey,
        sourceRecordId: recordId,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görev oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Göreve dönüştür" onClose={onClose} maxWidth={520} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {existingCount > 0 && (
          // Aynı kayıttan ikinci görev açmak yasak değil (bir plan birden fazla
          // kişiye bölünebilir) ama kullanıcı bilmeli.
          <div style={{ fontSize: 12, color: c.textSecondary, background: c.background, borderRadius: 8, padding: "8px 10px" }}>
            Bu kayıttan daha önce {existingCount} görev oluşturulmuş.
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>Görev başlığı</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>Açıklama</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={`${moduleTitle} kaydından oluşturuldu.`}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>Kime</span>
          <AssigneePicker departmentId={departmentId} value={assignedTo} onChange={(id) => setAssignedTo(id)} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>Teslim tarihi</span>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ width: "100%" }} />
        </label>

        {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: "#fff",
              fontSize: 14,
            }}
          >
            {saving ? "Oluşturuluyor…" : "Görevi oluştur"}
          </button>
          <button onClick={onClose} disabled={saving} style={{ padding: "8px 16px", fontSize: 14 }}>
            Vazgeç
          </button>
        </div>
      </div>
    </Modal>
  );
}
