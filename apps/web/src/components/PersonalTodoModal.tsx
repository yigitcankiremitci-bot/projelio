import { useId, useRef, useState } from "react";
import type { PersonalBoardItem, Task, TaskPriority } from "@projelio/shared";
import { MAX_TASK_PRIORITY } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import AutoGrowTextarea from "./AutoGrowTextarea";
import AutoGrowNotes from "./AutoGrowNotes";
import EntityDangerZone from "./EntityDangerZone";
import GorevKonumu from "./GorevKonumu";
import type { KonumHedefi } from "./GorevKonumu";
import { halfField, twoColumnRow } from "./gorevFormDuzeni";
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
  /**
   * Görev bir projeye/departmana atandığında çağrılır: kişisel kayıt artık
   * yok, yerine gerçek bir görev açıldı. Sayfa düzenleyiciyi o görevle
   * (TaskEditModal) yeniden açar — kullanıcı ekip, bütçe gibi alanları hemen
   * doldurabilsin diye.
   */
  onPromoted?: (task: Task) => void;
}

/**
 * Kişisel görev düzenleyicisi. Gerçek görevlerin TaskEditModal'ıyla AYNI
 * pencere: aynı genişlik, aynı alan sırası ve bileşenleri, altta yapışkan
 * Kaydet, aynı "Konum" ve arşivle/sil bölümleri. Eskiden dar ve farklı
 * dizilmiş ayrı bir form vardı; aynı panoda iki kart iki farklı ekran açıyordu.
 *
 * Kişisel görevde karşılığı olmayan alanlar (ekip, bütçe, yorumlar, dosyalar)
 * yok. Onlar gerekiyorsa görev "Konum"dan bir projeye/departmana atanır ve
 * gerçek göreve dönüşür (bkz. PersonalTodosService.promote).
 */
export default function PersonalTodoModal({ item, onClose, onChanged, onPromoted }: Props) {
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
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();

  const formPayload = () => ({
    title,
    description: description.trim() ? description : null,
    priority,
    dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    dueTime: dueTime || null,
    // Saat yoksa hatırlatma da yok — sunucu ve veritabanı aynı kuralda.
    reminderLeadMinutes: dueTime && reminderLead !== "" ? Number(reminderLead) : null,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.patch(`/todos/${item.itemId}`, formPayload());
      onChanged();
    } catch {
      setError(t("Görev güncellenemedi. Tekrar dene."));
      setSaving(false);
    }
  };

  /**
   * Projeye/departmana ata. Formdaki kaydedilmemiş değişiklikler önce yazılır:
   * yeni görev kişisel kayıttan kopyalanıyor, kullanıcı başlığı düzeltip
   * hemen "Ata"ya bastıysa düzeltme kaybolmasın.
   */
  const handlePromote = async (hedef: KonumHedefi) => {
    if (!title.trim()) throw new Error(t("Görev başlığı gerekli"));
    await api.patch(`/todos/${item.itemId}`, formPayload());
    let task = await api.post<Task>(`/todos/${item.itemId}/promote`, hedef);
    // Geri alma: açılan görevi sil, kişisel kaydı geri getir. İleri alma yeni
    // bir görev açar (kimliği değişir), bir sonraki geri alma onu siler.
    pushUndo({
      label: t("Görev atandı"),
      run: async () => {
        await api.delete(`/tasks/${task.id}`);
        await api.patch(`/todos/${item.itemId}/restore`, {});
      },
      redo: async () => {
        task = await api.post<Task>(`/todos/${item.itemId}/promote`, hedef);
      },
    });
    if (onPromoted) onPromoted(task);
    else onChanged();
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
        label: t("Kişisel görev silme"),
        run: async () => {
          await api.patch(`/todos/${item.itemId}/restore`, {});
        },
        redo: async () => {
          await api.delete(`/todos/${item.itemId}`);
        },
      });
      onChanged();
    } catch {
      setError(t("Görev silinemedi. Tekrar dene."));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("Görevi düzenle")}
      onClose={onClose}
      maxWidth={1280}
      footer={
        <button
          type="submit"
          form={formId}
          disabled={saving}
          style={{ width: "100%", background: c.primary, color: c.onPrimary, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {saving ? t("Kaydediliyor…") : t("Kaydet")}
        </button>
      }
    >
      <form id={formId} ref={formRef} onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Başlık")}</label>
          <AutoGrowTextarea
            value={title}
            onChange={setTitle}
            onSubmit={() => formRef.current?.requestSubmit()}
            onCancel={onClose}
            ariaLabel={t("Başlık")}
            maxLength={200}
            required
            minHeight={42}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Notlar")}</label>
          <AutoGrowNotes
            value={description}
            onChange={setDescription}
            placeholder={t("Görevle ilgili notlar (opsiyonel)")}
            ariaLabel={t("Notlar")}
            maxLength={2000}
            rows={4}
          />
        </div>

        {/* Proje görevindeki "Başlangıç / Bitiş" satırının yerinde: kişisel
            görevin başlangıç tarihi yok, göz öncelikle doluyor. */}
        <div style={twoColumnRow}>
          <div style={halfField}>
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
                    title={priority === value ? t("Önceliği kaldır") : `${value} yıldız`}
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
          <div style={halfField}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Bitiş tarihi")}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        {/* Saat opsiyonel; girilince hatırlatma seçeneği açılır. */}
        <div style={twoColumnRow}>
          <div style={halfField}>
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
          <div style={halfField}>
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

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}
      </form>

      <GorevKonumu onSec={handlePromote} />

      <EntityDangerZone
        entityLabel={t("Görevi")}
        onDelete={handleDelete}
        archiveMessage=""
        deleteMessage={t('"{baslik}" kişisel görevini silmek istediğine emin misin? Cmd/Ctrl+Z ile geri getirebilirsin.', { baslik: item.title })}
      />
    </Modal>
  );
}
