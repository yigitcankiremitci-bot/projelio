import { useRef, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Group, Organization } from "@projelio/shared";
import { api } from "../api/client";
import OrganizationCard from "../components/OrganizationCard";
import EditGroupModal from "../components/EditGroupModal";
import FilesPanel from "../components/FilesPanel";
import ProfileCard from "../components/ProfileCard";
import EntityCover, { CoverBackLink, coverActionButton } from "../components/EntityCover";
import { coverText } from "../lib/covers";
import { colors } from "../theme/colors";
import { useIsDesktop } from "../lib/useIsDesktop";
import { pageGutter } from "../lib/layout";
import { IconUser, IconCalendar, IconSettings } from "../components/icons";
import { usePageHeader } from "../lib/pageHeader";

// Not: "İşler" (job) kavramı yalnızca serbest çalışan/taşeron hesaplarına özgüdür;
// bir holding doğrudan iş değil, organizasyon (ve onların departmanlarını) yönetir.
export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = colors.light;
  const isDesktop = useIsDesktop();
  const gutter = pageGutter(isDesktop);
  const [group, setGroup] = useState<Group | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [editing, setEditing] = useState(false);

  const reload = () => {
    if (!id) return;
    api.get<Group>(`/groups/${id}`).then(setGroup).catch(() => setGroup(null));
    api.get<Organization[]>(`/groups/${id}/organizations`).then(setOrganizations).catch(() => setOrganizations([]));
  };

  useEffect(reload, [id]);

  useEffect(() => {
    if (group?.name) document.title = `${group.name} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [group?.name]);

  // Kaydırınca tepede beliren sabit başlık için (bkz. App.tsx / lib/pageHeader).
  const coverRef = useRef<HTMLDivElement>(null);
  // Akıştaki geri bağlantısının DOM öğesi: şerittekiler ancak bu kaybolunca belirir.
  const backRef = useRef<HTMLDivElement>(null);
  usePageHeader(group?.name, coverRef, [group?.name], { to: "/groups", label: "Gruplar", sourceRef: backRef });

  if (!id) return null;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <EntityCover
        coverRef={coverRef}
        back={
          <div ref={backRef}>
            <CoverBackLink to="/groups" label="Gruplar" />
          </div>
        }
        coverImageUrl={group?.coverImageUrl}
        height={270}
        title={group?.name ?? "…"}
        description={group?.description}
        meta={
          group && (
            <>
              {group.ownerName && (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <IconUser size={12} color={coverText.secondary} />
                  {group.ownerName}
                </span>
              )}
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconCalendar size={12} color={coverText.secondary} />
                {new Date(group.createdAt).toLocaleDateString("tr-TR")} kuruldu
              </span>
            </>
          )
        }
        aside={<ProfileCard />}
        action={
          <button onClick={() => setEditing(true)} aria-label="Grubu düzenle" style={coverActionButton(c)}>
            <IconSettings size={20} color={c.textSecondary} />
          </button>
        }
      />

      <div style={{ padding: `14px ${gutter}px 28px` }}>
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

        {/* Hiyerarşi: gruba bağlı organizasyonların departmanlarındaki tüm dosyalar. */}
        <div style={{ marginTop: 8, paddingTop: 24, borderTop: `1px solid ${c.border}` }}>
          {id && <FilesPanel groupId={id} />}
        </div>
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
