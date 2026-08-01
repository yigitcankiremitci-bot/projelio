import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Group, Job, Organization } from "@projelio/shared";
import { api } from "../api/client";
import JobCard from "../components/JobCard";
import OrganizationCard from "../components/OrganizationCard";
import EditGroupModal from "../components/EditGroupModal";
import { colors } from "../theme/colors";
import { IconUser, IconCalendar, IconSettings } from "../components/icons";

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = colors.light;
  const [group, setGroup] = useState<Group | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editing, setEditing] = useState(false);

  const reload = () => {
    if (!id) return;
    api.get<Group>(`/groups/${id}`).then(setGroup).catch(() => setGroup(null));
    api.get<Organization[]>(`/groups/${id}/organizations`).then(setOrganizations).catch(() => setOrganizations([]));
    api.get<Job[]>(`/groups/${id}/jobs`).then(setJobs).catch(() => setJobs([]));
  };

  useEffect(reload, [id]);

  useEffect(() => {
    if (group?.name) document.title = `${group.name} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [group?.name]);

  if (!id) return null;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <div
        style={{
          position: "relative",
          height: 200,
          background: group?.coverImageUrl
            ? `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.95)), center/cover url(${group.coverImageUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div style={{ paddingRight: 64 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>{group?.name ?? "…"}</h1>
          {group?.description && <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 8px" }}>{group.description}</p>}
          {group && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15, color: c.textSecondary }}>
              {group.ownerName && (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <IconUser size={12} color={c.textSecondary} />
                  {group.ownerName}
                </span>
              )}
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconCalendar size={12} color={c.textSecondary} />
                {new Date(group.createdAt).toLocaleDateString("tr-TR")} kuruldu
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setEditing(true)}
          aria-label="Grubu düzenle"
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
        <Link to="/groups" style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", margin: "14px 0" }}>
          ← Gruplar
        </Link>

        <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 14px" }}>Organizasyonlar</h2>

        {organizations.length === 0 ? (
          <div style={{ border: `1px dashed ${c.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: c.textSecondary, fontSize: 15, marginBottom: 24 }}>
            Bu gruba bağlı organizasyon yok. Bu sayfadayken alttaki "+" butonuyla ekleyebilirsin.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 24 }}>
            {organizations.map((o) => (
              <OrganizationCard key={o.id} organization={o} />
            ))}
          </div>
        )}

        <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 14px" }}>
          Gruba doğrudan bağlı işler
        </h2>
        <p style={{ fontSize: 15, color: c.textSecondary, margin: "-8px 0 14px" }}>
          Belirli bir organizasyona değil, doğrudan holding'e bağlı işler.
        </p>

        {jobs.length === 0 ? (
          <div style={{ border: `1px dashed ${c.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: c.textSecondary, fontSize: 15 }}>
            Gruba doğrudan bağlı iş yok.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} projectCount={j.projectCount ?? 0} />
            ))}
          </div>
        )}
      </div>

      {editing && group && (
        <EditGroupModal
          group={group}
          onClose={() => setEditing(false)}
          onSaved={reload}
          onDeleted={() => navigate("/groups")}
          onArchived={() => navigate("/groups")}
        />
      )}
    </div>
  );
}
