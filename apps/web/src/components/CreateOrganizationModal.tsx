import { useEffect, useState } from "react";
import type { Group, OrgType } from "@projelio/shared";
import { ORG_TYPE_LABEL } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";

interface Props {
  onClose: () => void;
  onCreated?: () => void;
  /** Belirtilirse (örn. bir Grup sayfasından açıldıysa) grup seçici gizlenir, sabit kullanılır. */
  fixedGroupId?: string;
}

export default function CreateOrganizationModal({ onClose, onCreated, fixedGroupId }: Props) {
  const c = colors.light;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("sirket");
  const [groupId, setGroupId] = useState(fixedGroupId ?? "");
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (fixedGroupId) return;
    api.get<Group[]>("/groups").then(setGroups).catch(() => setGroups([]));
  }, [fixedGroupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/organizations", { name, description: description || undefined, orgType, groupId: groupId || undefined });
      onClose();
      if (onCreated) onCreated();
      else window.location.reload();
    } catch {
      setError("Organizasyon oluşturulamadı. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Yeni organizasyon (şirket/marka)" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Ad</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Örn. Acme Yazılım A.Ş." style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kısa açıklama (opsiyonel)" style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Ölçek</label>
          <select value={orgType} onChange={(e) => setOrgType(e.target.value as OrgType)} style={{ width: "100%" }}>
            {(Object.keys(ORG_TYPE_LABEL) as OrgType[]).map((type) => (
              <option key={type} value={type}>
                {ORG_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>

        {!fixedGroupId && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bağlı olduğu grup (opsiyonel)</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Yok — tek başına organizasyon</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Oluşturuluyor…" : "Organizasyon oluştur"}
        </button>
      </form>
    </Modal>
  );
}
