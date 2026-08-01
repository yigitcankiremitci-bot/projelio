import { useEffect, useState } from "react";
import type { Group, Organization } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";

interface Props {
  onClose: () => void;
  onCreated?: () => void;
}

// İş isteğe bağlı olarak bir Organizasyona ya da bir Gruba bağlanabilir (ikisi birden
// değil). Bağlanırsa altındaki tüm projeler de otomatik o organizasyon/grubun sayılır.
type LinkMode = "none" | "organization" | "group";

export default function CreateJobModal({ onClose, onCreated }: Props) {
  const c = colors.light;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkMode, setLinkMode] = useState<LinkMode>("none");
  const [organizationId, setOrganizationId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Organization[]>("/organizations").then(setOrganizations).catch(() => setOrganizations([]));
    api.get<Group[]>("/groups").then(setGroups).catch(() => setGroups([]));
  }, []);

  const hasLinkOptions = organizations.length > 0 || groups.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/jobs", {
        title,
        description: description || undefined,
        organizationId: linkMode === "organization" ? organizationId || undefined : undefined,
        groupId: linkMode === "group" ? groupId || undefined : undefined,
      });
      onClose();
      if (onCreated) onCreated();
      else window.location.reload();
    } catch {
      setError("İş oluşturulamadı. Tekrar dene.");
      setLoading(false);
    }
  };

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

        {hasLinkOptions && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bağlantı (opsiyonel)</label>
            <select value={linkMode} onChange={(e) => setLinkMode(e.target.value as LinkMode)} style={{ width: "100%" }}>
              <option value="none">Yok — bağımsız iş</option>
              {organizations.length > 0 && <option value="organization">Bir organizasyona bağla</option>}
              {groups.length > 0 && <option value="group">Bir gruba (holding) bağla</option>}
            </select>

            {linkMode === "organization" && (
              <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} required style={{ width: "100%" }}>
                <option value="" disabled>
                  Organizasyon seç…
                </option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}

            {linkMode === "group" && (
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required style={{ width: "100%" }}>
                <option value="" disabled>
                  Grup seç…
                </option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

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
