import { useEffect, useState } from "react";
import type { ProjectMember, User } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";

interface Props {
  projectId: string;
  existingUserIds: string[];
  onClose: () => void;
  onAdded: (member: ProjectMember) => void;
}

export default function AddMemberModal({ projectId, existingUserIds, onClose, onAdded }: Props) {
  const c = colors.light;
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"member" | "subcontractor">("member");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<User[]>("/users").then(setUsers).catch(() => setUsers([]));
  }, []);

  const candidates = users.filter((u) => !existingUserIds.includes(u.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setError("");
    try {
      const created = await api.post<ProjectMember>(`/projects/${projectId}/members`, { userId, role });
      onAdded(created);
    } catch {
      setError("Üye eklenemedi. Tekrar dene.");
      setSaving(false);
    }
  };

  return (
    <Modal title="Ekibe üye ekle" onClose={onClose} maxWidth={380}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Kullanıcı</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} required style={{ width: "100%" }}>
            <option value="">Seç…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.email})
              </option>
            ))}
          </select>
          {candidates.length === 0 && <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Eklenebilecek başka kullanıcı yok.</p>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value as "member" | "subcontractor")} style={{ width: "100%" }}>
            <option value="member">Ekip üyesi</option>
            <option value="subcontractor">Taşeron</option>
          </select>
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving || !userId}
          style={{ background: c.primary, color: "#fff", padding: "10px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {saving ? "Ekleniyor…" : "Ekle"}
        </button>
      </form>
    </Modal>
  );
}
