import { useState } from "react";
import type { PersonalBoardItem, TaskPriority } from "@projelio/shared";
import { MAX_TASK_PRIORITY } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconStar } from "./icons";
import { useUndo } from "../lib/undo";
import { useT } from "../lib/i18n";

function toDateInputValue(iso?: string) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

interface Props {
  item: PersonalBoardItem;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Kişisel görev düzenleyicisi. Gerçek görevlerin TaskEditModal'ıyla aynı iskelet
 * (ortak Modal, aynı alan düzeni, aynı kaydet/sil yerleşimi); yalnızca kişisel
 * görevde karşılığı olmayan alanlar (atanan kişi, bütçe, yorumlar, dosyalar)
 * yok — bunlar kişisel bir yapılacakta anlamsız.
 */
export default function PersonalTodoModal({ item, onClose, onChanged }: Props) {
  const c = useThemeColors();
  const t = useT();
  const { pushUndo } = useUndo();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(item.priority);
  const [dueDate, setDueDate] = useState(toDateInputValue(item.effectiveDueDate));
  // Bitiş saati + hatırlatma (bkz. 059): iş görevlerindeki alanların birebir aynısı.
  const [dueTime, setDueTime] = useState(item.deadlineTime ?? "");
  const [reminderLead, setReminderLead] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.patch(`/todos/${item.itemId}`, {
        title,
        description: description.trim() ? description : null,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        dueTime: dueTime || null,
        // Saat yoksa hatırlatma da yok — sunucu ve veritabanı aynı kuralda.
        reminderLeadMinutes: dueTime && reminderLead !== "" ? Number(reminderLead) : null,
      });
      onChanged();
    } catch {
      setError("Görev güncellenemedi. Tekrar dene.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      // Kalıcı silmez, arşivler — yanlışlıkla silme geri alınabilsin diye.
      await api.delete(`/todos/${item.itemId}`);
      // Gerçek görevlerdeki tekil silme/arşivleme gibi (bkz. EntityDangerZone)
      // Cmd/Ctrl+Z ile geri alınabilir olsun — arşivleme süresiz geri alınabilir
      // olduğu için burada pushDestructive değil, doğrudan pushUndo kullanılır.
      pushUndo({
        label: "Kişisel görev silme",
        run: async () => {
          await api.patch(`/todos/${item.itemId}/restore`, {});
        },
        redo: async () => {
          await api.delete(`/todos/${item.itemId}`);
        },
      });
      onChanged();
    } catch {
      setError("Görev silinemedi. Tekrar dene.");
      setSaving(false);
    }
  };

  return (
    <Modal title={t("Kişisel görevi düzenle")} onClose={onClose} maxWidth={520}>
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Bu görevi senden başkası görmez.")}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Başlık")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Notlar")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 180px" }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Öncelik")}</label>
            {/* Kanban kartlarındakiyle aynı 0-5 yıldız ölçeği. */}
            <div role="radiogroup" aria-label={t("Öncelik")} style={{ display: "flex", gap: 2, alignItems: "center", height: 34 }}>
              {Array.from({ length: MAX_TASK_PRIORITY }, (_, i) => {
                const value = (i + 1) as TaskPriority;
                const filled = value <= priority;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={priority === value}
                    aria-label={`${value} yıldız`}
                    title={priority === value ? "Önceliği kaldır" : `${value} yıldız`}
                    // Aynı yıldıza tekrar basmak önceliği kaldırır.
                    onClick={() => setPriority(priority === value ? 0 : value)}
                    style={{ display: "flex", padding: 2, border: "none", background: "transparent", lineHeight: 0 }}
                  >
                    <IconStar size={18} color={filled ? c.accent : c.border} filled={filled} />
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Tarih")}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        {/* Saat opsiyonel; girilince hatırlatma seçeneği açılır. */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 140px" }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Bitiş saati (opsiyonel)")}</label>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => {
                setDueTime(e.target.value);
                if (!e.target.value) setReminderLead("");
              }}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 140px" }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Hatırlat")}</label>
            <select
              value={reminderLead}
              onChange={(e) => setReminderLead(e.target.value)}
              disabled={!dueTime}
              style={{ width: "100%" }}
            >
              <option value="">{t("Hatırlatma yok")}</option>
              <option value="0">{t("Tam saatinde")}</option>
              <option value="15">{t("15 dakika önce")}</option>
              <option value="60">{t("1 saat önce")}</option>
              <option value="1440">{t("1 gün önce")}</option>
            </select>
          </div>
        </div>

        {error && <p style={{ fontSize: 14, color: c.danger, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          {confirmingDelete ? (
            <>
              <span style={{ fontSize: 14, color: c.textSecondary }}>Silinsin mi?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: c.danger, color: "#fff", fontSize: 15 }}
              >
                {t("Evet, sil")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 15 }}
              >
                {t("Vazgeç")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.danger, fontSize: 15 }}
            >
              {t("Sil")}
            </button>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              marginLeft: "auto",
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
