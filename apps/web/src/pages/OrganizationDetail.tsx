import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Job, Organization } from "@projelio/shared";
import { api } from "../api/client";
import JobCard from "../components/JobCard";
import EditOrganizationModal from "../components/EditOrganizationModal";
import FilesPanel from "../components/FilesPanel";
import { colors } from "../theme/colors";
import { IconUser, IconCalendar, IconSettings, IconLayers } from "../components/icons";

export default function OrganizationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = colors.light;
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editing, setEditing] = useState(false);

  const reload = () => {
    if (!id) return;
    api.get<Organization>(`/organizations/${id}`).then(setOrganization).catch(() => setOrganization(null));
    api.get<Job[]>(`/organizations/${id}/jobs`).then(setJobs).catch(() => setJobs([]));
  };

  useEffect(reload, [id]);

  useEffect(() => {
    if (organization?.name) document.title = `${organization.name} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [organization?.name]);

  if (!id) return null;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <div
        style={{
          position: "relative",
          height: 200,
          background: organization?.coverImageUrl
            ? `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.95)), center/cover url(${organization.coverImageUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div style={{ paddingRight: 64 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>
            {organization?.name ?? "…"}
          </h1>
          {organization?.description && (
            <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 8px" }}>{organization.description}</p>
          )}
          {organization && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15, color: c.textSecondary }}>
              {organization.ownerName && (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <IconUser size={12} color={c.textSecondary} />
                  {organization.ownerName}
                </span>
              )}
              {organization.groupName && (
                <Link to={`/groups/${organization.groupId}`} style={{ display: "flex", alignItems: "center", gap: 5, color: c.textSecondary }}>
                  <IconLayers size={12} color={c.textSecondary} />
                  {organization.groupName}
                </Link>
              )}
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconCalendar size={12} color={c.textSecondary} />
                {new Date(organization.createdAt).toLocaleDateString("tr-TR")} kuruldu
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setEditing(true)}
          aria-label="Organizasyonu düzenle"
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 10,
            border: `1px solid ${c.border}`,
            background: c.surface,
            boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
          }}
        >
          <IconSettings size={20} color={c.textSecondary} />
        </button>
      </div>

      <div style={{ padding: "0 28px 28px" }}>
        <Link to="/organizations" style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", margin: "14px 0" }}>
          ← Organizasyonlar
        </Link>

        <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "10px 0 14px" }}>İşler</h2>

        {jobs.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${c.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
              color: c.textSecondary,
              fontSize: 16,
            }}
          >
            Bu organizasyona bağlı iş yok. Bir iş oluştururken (ya da mevcut bir işi düzenlerken) bu organizasyonu seçebilirsin.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} projectCount={j.projectCount ?? 0} />
            ))}
          </div>
        )}

        {/* Hiyerarşi: organizasyona bağlı işlerin bütün dosyaları tek listede.
            Yükleme burada yok — dosya her zaman bir işe ait olmak zorunda. */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${c.border}` }}>
          {id && <FilesPanel organizationId={id} />}
        </div>
      </div>

      {editing && organization && (
        <EditOrganizationModal
          organization={organization}
          onClose={() => setEditing(false)}
          onSaved={reload}
          onDeleted={() => navigate("/organizations")}
          onArchived={() => navigate("/organizations")}
        />
      )}
    </div>
  );
}
