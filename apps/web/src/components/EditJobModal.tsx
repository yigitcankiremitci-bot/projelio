import { useEffect, useState } from "react";
import type { Group, Job, Organization } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { resizeCoverImage } from "../lib/imageProcessing";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";
import HireMemberModal from "./HireMemberModal";
import { IconUser } from "./icons";

interface Props {
  job: Job;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  onArchived?: () => void;
}

type LinkMode = "none" | "organization" | "group";

export default function EditJobModal({ job, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = colors.light;
  const [title, setTitle] = useState(job.title);
  const [description, setDescription] = useState(job.description ?? "");
  const [linkMode, setLinkMode] = useState<LinkMode>(job.organizationId ? "organization" : job.groupId ? "group" : "none");
  const [organizationId, setOrganizationId] = useState(job.organizationId ?? "");
  const [groupId, setGroupId] = useState(job.groupId ?? "");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hiring, setHiring] = useState(false);

  useEffect(() => {
    api.get<Organization[]>("/organizations").then(setOrganizations).catch(() => setOrganizations([]));
    api.get<Group[]>("/groups").then(setGroups).catch(() => setGroups([]));
  }, []);

  const hasLinkOptions = organizations.length > 0 || groups.length > 0;

  const handleDelete = async () => {
    await api.delete(`/jobs/${job.id}`);
    onDeleted?.();
  };

  const handleArchive = async () => {
    await api.patch(`/jobs/${job.id}/archive`, {});
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
      await api.patch(`/jobs/${job.id}`, {
        title,
        description: description || undefined,
        organizationId: linkMode === "organization" ? organizationId || undefined : null,
        groupId: linkMode === "group" ? groupId || undefined : null,
      });
      if (coverFile) {
        const resized = await resizeCoverImage(coverFile);
        const formData = new FormData();
        formData.append("file", resized);
        await api.uploadFile(`/jobs/${job.id}/cover`, formData);
      }
      onSaved();
      onClose();
    } catch {
      setError("İş güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="İşi düzenle" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: "100%" }} />
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

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Kapak fotoğrafı</label>
          {(coverPreview || job.coverImageUrl) && (
            <div
              style={{
                height: 90,
                borderRadius: 8,
                background: `center/cover url(${coverPreview ?? job.coverImageUrl})`,
              }}
            />
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

      <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 16, paddingTop: 16 }}>
        <button
          type="button"
          onClick={() => setHiring(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "10px 0",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          <IconUser size={15} color={c.textSecondary} />
          İşe al
        </button>
      </div>

      {hiring && <HireMemberModal jobId={job.id} existingUserIds={[]} onClose={() => setHiring(false)} onHired={() => setHiring(false)} />}

      <EntityDangerZone
        entityLabel="İşi"
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={`"${job.title}" işini arşive eklemek istediğine emin misin? Bu işe bağlı tüm projeler ve görevler de arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.`}
        deleteMessage={`"${job.title}" işini silmek istediğine emin misin? Bu işe bağlı tüm projeler ve görevler de silinecek. Bu işlem geri alınamaz.`}
      />
    </Modal>
  );
}
