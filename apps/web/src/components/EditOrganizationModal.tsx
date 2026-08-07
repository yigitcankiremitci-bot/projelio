import { useEffect, useState } from "react";
import type { Group, Organization, OrgType } from "@projelio/shared";
import { ORG_TYPE_LABEL } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { resizeCoverImage } from "../lib/imageProcessing";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";

interface Props {
  organization: Organization;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  onArchived?: () => void;
}

export default function EditOrganizationModal({ organization, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = colors.light;
  const [name, setName] = useState(organization.name);
  const [description, setDescription] = useState(organization.description ?? "");
  const [groupId, setGroupId] = useState(organization.groupId ?? "");
  const [orgType, setOrgType] = useState<OrgType>(organization.orgType ?? "sirket");
  const [groups, setGroups] = useState<Group[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Group[]>("/groups").then(setGroups).catch(() => setGroups([]));
  }, []);

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    onDeleted?.();
  };

  const handleArchive = async () => {
    await api.patch(`/organizations/${organization.id}/archive`, {});
    onArchived?.();
  };

  const handleCoverChange = (file: File | null) => {
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.patch(`/organizations/${organization.id}`, {
        name,
        description: description || undefined,
        groupId: groupId || null,
        orgType,
      });
      if (coverFile) {
        const resized = await resizeCoverImage(coverFile);
        const formData = new FormData();
        formData.append("file", resized);
        await api.uploadFile(`/organizations/${organization.id}/cover`, formData);
      }
      onSaved();
      onClose();
    } catch {
      setError("Organizasyon güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Organizasyonu düzenle" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Ad</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kısa açıklama (opsiyonel)"
            style={{ width: "100%" }}
          />
        </div>

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

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Kapak fotoğrafı</label>
          {(coverPreview || organization.coverImageUrl) && (
            <div style={{ height: 90, borderRadius: 8, background: `center/cover url(${coverPreview ?? organization.coverImageUrl})` }} />
          )}
          <input type="file" accept="image/*" onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)} />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>

      <EntityDangerZone
        entityLabel="Organizasyonu"
        resourcePath={`/organizations/${organization.id}`}
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={`"${organization.name}" organizasyonunu arşive eklemek istediğine emin misin? Bu organizasyona bağlı tüm projeler de arşive taşınır.`}
        deleteMessage={`"${organization.name}" organizasyonunu silmek istediğine emin misin? Bu organizasyona bağlı projelerin organizasyon bağlantısı kaldırılır (projeler silinmez). Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
