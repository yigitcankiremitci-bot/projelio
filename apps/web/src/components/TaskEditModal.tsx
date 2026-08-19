import { useEffect, useRef, useState } from "react";
import type { Task, TaskComment } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";
import AssigneePicker from "./AssigneePicker";
import EntityDangerZone from "./EntityDangerZone";
import FilesPanel from "./FilesPanel";
import TaskAttachmentsPanel from "./TaskAttachmentsPanel";
import AutoGrowTextarea from "./AutoGrowTextarea";
import AutoGrowNotes from "./AutoGrowNotes";
import { useCurrentUser } from "../lib/useCurrentUser";

interface Props {
  task: Task;
  /**
   * Rutin tekrarlarının projesi yoktur ama rutinin bağlı olduğu İŞ vardır.
   * Verilirse Dosyalar bölümü o iş bağlamıyla açılır — dosyalar Drive/OneDrive'da
   * yaşadığı ve her dosya bir işe ait olduğu için (bkz. FilesPanel) bağlam şart.
   */
  fileJobId?: string;
  onClose: () => void;
  onSaved: (updated: Task) => void;
  onDeleted?: (deletedTaskId: string) => void;
  onArchived?: (archivedTaskId: string) => void;
}

function toDateInputValue(iso?: string) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

export default function TaskEditModal({ task, fileJobId, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = colors.light;
  const formRef = useRef<HTMLFormElement>(null);
  const isSubtask = Boolean(task.parentTaskId);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(task.startDate));
  const [deadline, setDeadline] = useState(toDateInputValue(task.deadline));
  // Opsiyonel bitiş saati ve ona bağlı hatırlatma (bkz. migration 057).
  const [deadlineTime, setDeadlineTime] = useState(task.deadlineTime ?? "");
  const [reminderLead, setReminderLead] = useState<string>(
    task.reminderLeadMinutes != null ? String(task.reminderLeadMinutes) : ""
  );
  // Çoklu atama (bkz. migration 053). İlk eleman birincil atanan sayılır;
  // eski tek atamalı görevlerde `assignees` boş gelebilir, o zaman assignedTo'ya düşülür.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task.assignees?.length ? task.assignees.map((a) => a.userId) : task.assignedTo ? [task.assignedTo] : []
  );
  const [budget, setBudget] = useState(String(task.budget ?? 0));
  const [durationValue, setDurationValue] = useState(
    task.estimatedDurationValue != null ? String(task.estimatedDurationValue) : ""
  );
  const [durationUnit, setDurationUnit] = useState<"hours" | "days">(task.estimatedDurationUnit ?? "hours");
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const { user: currentUser } = useCurrentUser();

  /**
   * Görevden ayrılma: kullanıcı kendini atananlar listesinden çıkarır. Görev
   * silinmez, başkalarının ataması bozulmaz. Son atanan da ayrılırsa görev
   * "atanmamış" kalır — kimseye zorla bırakılmaktansa ekibin görüp yeniden
   * ataması daha dürüst.
   */
  const amAssigned = assigneeIds.includes(currentUser?.id ?? "");

  const handleLeaveTask = async () => {
    if (!currentUser) return;
    if (!window.confirm("Bu görevden ayrılmak istiyor musun? Görev silinmez, üzerinden düşersin.")) return;
    const updated = await api.delete<Task>(`/tasks/${task.id}/assignees/me`).catch(() => null);
    if (updated) {
      setAssigneeIds(updated.assignees?.map((a) => a.userId) ?? []);
      onSaved(updated);
    }
  };

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    onDeleted?.(task.id);
  };

  const handleArchive = async () => {
    await api.patch(`/tasks/${task.id}/archive`, {});
    onArchived?.(task.id);
  };

  useEffect(() => {
    api
      .get<TaskComment[]>(`/tasks/${task.id}/comments`)
      .then(setComments)
      .catch(() => setComments([]));
  }, [task.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const trimmedDuration = durationValue.trim();
      const updated = await api.patch<Task>(`/tasks/${task.id}`, {
        title,
        description: description.trim() ? description : null,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        deadlineTime: deadlineTime || null,
        // Saat yoksa hatırlatma da yok: sunucu ve veritabanı aynı kuralı uyguluyor.
        reminderLeadMinutes: deadlineTime && reminderLead !== "" ? Number(reminderLead) : null,
        assignedToIds: assigneeIds,
        budget: Number(budget) || 0,
        estimatedDurationValue: trimmedDuration ? Number(trimmedDuration) : null,
        estimatedDurationUnit: trimmedDuration ? durationUnit : null,
      });
      onSaved(updated);
    } catch {
      setError("Görev güncellenemedi. Tekrar dene.");
      setSaving(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    setPostingComment(true);
    try {
      const created = await api.post<TaskComment>(`/tasks/${task.id}/comments`, { body: trimmed });
      setComments((prev) => [...prev, created]);
      setCommentBody("");
    } catch {
      // yorum gönderilemedi, kullanıcı tekrar deneyebilir
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <Modal title="Görevi düzenle" onClose={onClose} maxWidth={1280}>
      <form ref={formRef} onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          {/* Uzun başlık tek satırda yatay kayıp okunmaz hale gelmesin diye
              sararak büyüyen alan; Enter yine kaydeder (bkz. AutoGrowTextarea). */}
          <AutoGrowTextarea
            value={title}
            onChange={setTitle}
            onSubmit={() => formRef.current?.requestSubmit()}
            onCancel={onClose}
            ariaLabel="Başlık"
            maxLength={200}
            required
            minHeight={42}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Notlar</label>
          {/* Dört satır yüksekliğinde durur, not uzadıkça kendiliğinden büyür:
              sabit yükseklikte uzun not kendi içinde kayan bir kutuya hapsoluyor
              ve yazılanın tamamı görünmüyordu (bkz. AutoGrowNotes). */}
          <AutoGrowNotes
            value={description}
            onChange={setDescription}
            placeholder="Görevle ilgili notlar (opsiyonel)"
            ariaLabel="Notlar"
            maxLength={2000}
            rows={4}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Başlangıç tarihi</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bitiş tarihi</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ width: "100%" }} />
          </div>
        </div>

        {/* Bitiş saati opsiyonel: çoğu görevin saati yok, zorunlu kılmak her
            görevde anlamsız bir seçim dayatırdı. Saat girilince hatırlatma
            seçeneği açılır — saat yokken "ne kadar önce" sorusunun karşılığı yok. */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bitiş saati (opsiyonel)</label>
            <input
              type="time"
              value={deadlineTime}
              onChange={(e) => {
                setDeadlineTime(e.target.value);
                // Saat silinince hatırlatma da düşer; kalırsa kaydedilmeyen bir
                // seçim ekranda asılı kalıyordu.
                if (!e.target.value) setReminderLead("");
              }}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Hatırlat</label>
            <select
              value={reminderLead}
              onChange={(e) => setReminderLead(e.target.value)}
              disabled={!deadlineTime}
              style={{ width: "100%" }}
            >
              <option value="">Hatırlatma yok</option>
              <option value="0">Tam saatinde</option>
              <option value="15">15 dakika önce</option>
              <option value="60">1 saat önce</option>
              <option value="1440">1 gün önce</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Ekip</label>
            {/* Tüm kullanıcılar yerine yalnızca proje ekibi/departman kadrosu, arama ile.
                Çoklu: bir görevi birden fazla kişi birlikte yürütebilir. */}
            <AssigneePicker
              projectId={task.projectId}
              departmentId={task.departmentId}
              multiple
              values={assigneeIds}
              onChangeValues={setAssigneeIds}
              value=""
              onChange={() => {}}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bütçe (₺)</label>
            <input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Tahmini süre (opsiyonel)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              min={0}
              step="0.5"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              placeholder="Örn. 4"
              style={{ flex: 1 }}
            />
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as "hours" | "days")}
              style={{ flex: 1 }}
            >
              <option value="hours">Saat</option>
              <option value="days">Gün</option>
            </select>
          </div>
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving}
          style={{ background: c.primary, color: "#fff", padding: "10px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>

      {amAssigned && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            onClick={handleLeaveTask}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.danger,
              cursor: "pointer",
            }}
          >
            Görevden ayrıl
          </button>
        </div>
      )}

      {/* Link/dosya ekleri her görevde çalışır — rutin tekrarları dahil (bkz. 060).
          FilesPanel'den ayrı: o Drive/OneDrive klasör bağlamı kurar ve proje
          gerektirir; bu ise göreve doğrudan bağlı, bağlamsız bir ek listesi. */}
      <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
        <TaskAttachmentsPanel taskId={task.id} />
      </div>

      {/* Dosyalar Drive/OneDrive'da yaşar; kendi veritabanımıza dosya yazılmaz.
          Proje görevinde proje bağlamı, rutin tekrarında rutinin işi kullanılır —
          ikisi de yoksa (departman görevi) bölüm hiç açılmaz. */}
      {(task.projectId || fileJobId) && (
        <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>Dosyalar</h3>
          {task.projectId ? (
            <FilesPanel projectId={task.projectId} taskId={task.id} compact />
          ) : (
            <FilesPanel jobId={fileJobId} taskId={task.id} compact />
          )}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>Yorumlar</h3>

        {comments.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 12px" }}>Henüz yorum yok.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: 180, overflowY: "auto" }}>
            {comments.map((cm) => (
              <div key={cm.id} style={{ background: c.background, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{cm.authorName}</span>
                  <span style={{ fontSize: 13, color: c.textSecondary }}>
                    {new Date(cm.createdAt).toLocaleDateString("tr-TR")}
                  </span>
                </div>
                <p style={{ fontSize: 16, color: c.textPrimary, margin: 0, lineHeight: 1.4 }}>{cm.body}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddComment} style={{ display: "flex", gap: 8 }}>
          <input
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Yorum yaz…"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            disabled={postingComment || !commentBody.trim()}
            style={{ padding: "0 16px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 16, fontWeight: 500 }}
          >
            Gönder
          </button>
        </form>
      </div>

      <EntityDangerZone
        entityLabel={isSubtask ? "Alt görevi" : "Görevi"}
        resourcePath={`/tasks/${task.id}`}
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={
          isSubtask
            ? `"${task.title}" alt görevini arşive eklemek istediğine emin misin? İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`
            : `"${task.title}" görevini arşive eklemek istediğine emin misin? Varsa bu göreve bağlı tüm alt görevler de arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`
        }
        deleteMessage={
          isSubtask
            ? `"${task.title}" alt görevini silmek istediğine emin misin? Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.`
            : `"${task.title}" görevini silmek istediğine emin misin? Varsa bu göreve bağlı tüm alt görevler de silinecek. Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.`
        }
      />
    </Modal>
  );
}
