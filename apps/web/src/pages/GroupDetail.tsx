import { useRef, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Group, Organization } from "@projelio/shared";
import { api } from "../api/client";
import { useLiveRoom } from "../lib/liveRoom";
import OrganizationCard from "../components/OrganizationCard";
import EditGroupModal from "../components/EditGroupModal";
import FilesPanel from "../components/FilesPanel";
import ScopeBudgetPanel from "../components/butce/ScopeBudgetPanel";
import AiCreditsChip from "../components/AiCreditsChip";
import AskLioButton from "../components/AskLioButton";
import { useAppPrefs } from "../lib/appPrefs";
import { coverActionButton } from "../components/EntityCover";
import AnasayfaBaslik, { GeriDugmesi } from "../components/anasayfa/AnasayfaBaslik";
import { useThemeColors } from "../theme/useThemeColors";
import { useIsDesktop } from "../lib/useIsDesktop";
import { pageGutter } from "../lib/layout";
import { IconSettings } from "../components/icons";
import { usePageHeader } from "../lib/pageHeader";
import { useBackTarget, useGezintiAdi } from "../lib/backTarget";
import { useT } from "../lib/i18n";

// Not: "İşler" (job) kavramı yalnızca serbest çalışan/taşeron hesaplarına özgüdür;
// bir holding doğrudan iş değil, organizasyon (ve onların departmanlarını) yönetir.
export default function GroupDetail() {
  const { id } = useParams();
  // Aynı sayfadaki kullanıcılar: canlı tazeleme + "kim burada" (bkz. lib/liveRoom.ts).
  useLiveRoom(id ? `group:${id}` : null);
  const navigate = useNavigate();
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const prefs = useAppPrefs();
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
  const headerRef = useRef<HTMLDivElement>(null);
  // Geri, holdinge hangi sayfadan girildiyse oraya döner (bkz. lib/backTarget).
  const back = useBackTarget({ to: "/groups", label: t("Gruplar") });
  // Buradan açılan modülün geri bağlantısı bu sayfaya dönebilsin.
  useGezintiAdi(group?.name);
  // sourceRef bilerek verilmiyor: geri düğmesi en üst bantta doğuyor ve yüzen hap
  // "kaynak çizgiyi geçti" sayıp sayfa kaydırılmadan açılıyordu; kaynak yokken
  // hap şeritle birlikte, ancak başlık yukarı kayınca belirir.
  usePageHeader(group?.name, headerRef, [group?.name, back.to, back.label, back.geriGit], back);

  if (!id) return null;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <AnasayfaBaslik
        baslik={group?.name ?? "…"}
        baslikRef={headerRef}
        geri={<GeriDugmesi to={back.to} etiket={back.label} geriGit={back.geriGit} />}
        araclar={
          <>
            {prefs.showLio && <AiCreditsChip compact={!isDesktop} />}
            {group && <AskLioButton subject={{ kind: "grup", title: group.name, id: group.id }} size={28} withBackground />}
            <button onClick={() => setEditing(true)} aria-label={t("Grubu düzenle")} title={t("Grubu düzenle")} style={coverActionButton(c)}>
              <IconSettings size={20} color={c.textSecondary} />
            </button>
          </>
        }
      />

      <div style={{ padding: `0 ${gutter}px 28px` }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 14px" }}>{t("Organizasyonlar")}</h2>

        {organizations.length === 0 ? (
          <div style={{ border: `1px dashed ${c.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: c.textSecondary, fontSize: 15, marginBottom: 24 }}>
            {t("Bu gruba bağlı organizasyon yok. Bu sayfadayken alttaki \"+\" butonuyla ekleyebilirsin.")}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 24 }}>
            {organizations.map((o) => (
              <OrganizationCard key={o.id} organization={o} />
            ))}
          </div>
        )}

        {/* HOLDİNG KASASI — hiyerarşinin en üstü.
            Buradaki rakamlar bağlı TÜM organizasyonların (ve onların
            departman/iş/proje kademelerinin) toplamıdır; holdinge doğrudan
            girilen gelir/giderler de aynı ekranda ama ayrı satırlarda durur.
            Hiçbir tutar iki kez sayılmaz: bir kayıt yalnızca tek bir kademeye
            aittir (bkz. butce-hiyerarsi.service.ts).

            Holdingi olmayan kullanıcıda bu kademe hiç yoktur; son durak
            organizasyon ya da serbest çalışanın kişisel Kasa'sıdır. */}
        <div style={{ marginTop: 8, paddingTop: 24, borderTop: `1px solid ${c.border}` }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 14px" }}>{t("Holding kasası")}</h2>
          {id && <ScopeBudgetPanel scopeType="group" scopeId={id} />}
        </div>

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
