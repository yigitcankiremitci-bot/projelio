import { useEffect, useState } from "react";
import type { Task, TaskComment, User } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";

interface Props {
  task: Task;
  onClose: () => void;
  onSaved: (updated: Task) => void;
  onDeleted?: (deletedTaskId: string) => void;
  onArchived?: (archivedTaskId: string) => void;
}

function toDateInputValue(iso?: string) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

export default function TaskEditModal({ task, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = colors.light;
  const isSubtask = Boolean(task.parentTaskId);
  const [title, setTitle] = useState(task.title);
  const [startDate, setStartDate] = useState(toDateInputValue(task.startDate));
  const [deadline, setDeadline] = useState(toDateInputValue(task.deadline));
  const [assignedTo, setAssignedTo] = useState(task.assignedTo ?? "");
  const [budget, setBudget] = useState(String(task.budget ?? 0));
  const [users, setUsers] = useState<User[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  const handleDelete = async () => {
    await api.delete(`/tasks/${task.id}`);
    onDeleted?.(task.id);
  };

  const handleArchive = async () => {
    await api.patch(`/tasks/${task.id}/archive`, {});
    onArchived?.(task.id);
  };

  useEffect(() => {
    api.get<User[]>("/users").then(setUsers).catch(() => setUsers([]));
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
      const updated = await api.patch<Task>(`/tasks/${task.id}`, {
        title,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        assignedTo: assignedTo || null,
        budget: Number(budget) || 0,
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
    <Modal title="Görevi düzenle" onClose={onClose} maxWidth={460}>
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: "100%" }} />
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

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Ekip</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={{ width: "100%" }}>
              <option value="">Atanmamış</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bütçe (₺)</label>
            <input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: "100%" }} />
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
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={
          isSubtask
            ? `"${task.title}" alt görevini arşive eklemek istediğine emin misin? İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`
            : `"${task.title}" görevini arşive eklemek istediğine emin misin? Varsa bu göreve bağlı tüm alt görevler de arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`
        }
        deleteMessage={
          isSubtask
            ? `"${task.title}" alt görevini silmek istediğine emin misin? Bu işlem geri alınamaz.`
            : `"${task.title}" görevini silmek istediğine emin misin? Varsa bu göreve bağlı tüm alt görevler de silinecek. Bu işlem geri alınamaz.`
        }
      />
    </Modal>
  );
}
