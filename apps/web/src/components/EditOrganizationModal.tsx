import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CoverPicker from "./CoverPicker";
import type { Group, Organization, OrgType } from "@projelio/shared";
import { ORG_TYPE_LABEL } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { resizeCoverImage } from "../lib/imageProcessing";
import Modal from "./Modal";
import OrganizationStorageSection from "./OrganizationStorageSection";
import EntityDangerZone from "./EntityDangerZone";
import TabVisibilitySection from "./TabVisibilitySection";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { useT } from "../lib/i18n";
import { useCurrentUser } from "../lib/useCurrentUser";
import ConfirmDialog from "./ConfirmDialog";
import { IconLogout } from "./icons";

interface Props {
  organization: Organization;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
  onArchived?: () => void;
}

export default function EditOrganizationModal({ organization, onClose, onSaved, onDeleted, onArchived }: Props) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [name, setName] = useState(organization.name);
  const [description, setDescription] = useState(organization.description ?? "");
  const [groupId, setGroupId] = useState(organization.groupId ?? "");
  const [orgType, setOrgType] = useState<OrgType>(organization.orgType ?? "sirket");
  const [groups, setGroups] = useState<Group[]>([]);
  // Seçili kapak: yüklenmiş bir URL, "preset:<key>" ya da kapak yok.
  const [coverValue, setCoverValue] = useState<string | undefined>(organization.coverImageUrl);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  // Kapatılan sekmeler (bkz. TabVisibilitySection). Kaydedene kadar yalnızca
  // burada durur; sayfadaki çubuk "Kaydet"ten sonra tazelenir.
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(organization.hiddenTabs ?? []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Şirketten ayrılma onayı (yalnızca sahibi OLMAYANLARA görünür).
  const [leaving, setLeaving] = useState(false);
  const { user: currentUser } = useCurrentUser();
  // Sahibi kim olduğu bilinmiyorsa (eski kayıt) eski davranış sürsün: tehlikeli
  // bölge görünür, "ayrıl" görünmez. Yanlış tarafa düşmek, sahibine ayrılma
  // düğmesi göstermekten iyidir.
  const isOwner = !organization.ownerId || currentUser?.id === organization.ownerId;

  // Şirketten ayrılmak = o şirketteki TÜM bağların bırakılması: doğrudan üyelik
  // ve departman kadroları (bkz. OrganizationsService.leave). Son yöneticisi
  // olunan departmanlar hemen bırakılamaz, kurucunun onayına düşer — sunucu
  // bunları geri bildiriyor ki kullanıcı "ayrıldım sandım" demesin.
  const handleLeave = async () => {
    const sonuc = await api
      .patch<{ success: true; pendingDepartments: string[] }>(
        `/organizations/${organization.id}/members/me/leave`,
        {}
      )
      .catch(() => null);
    if (!sonuc) {
      setError(t("Şirketten ayrılınamadı. Tekrar dene."));
      return;
    }
    if (sonuc.pendingDepartments.length > 0) {
      window.alert(
        t(
          "Şirketten ayrıldın. Son yöneticisi olduğun departmanlarda ({departmanlar}) ayrılma talebin şirket kurucusunun onayını bekliyor.",
          { departmanlar: sonuc.pendingDepartments.join(", ") }
        )
      );
    }
    notifySidebarChanged();
    onClose();
    navigate("/");
  };

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
        hiddenTabs,
        // Hazır kapak seçimi / kapağı kaldırma doğrudan bu alanla kaydedilir;
        // dosya yüklemesi ayrı uçtan gider. Değişmediyse hiç gönderilmez.
        ...(coverValue !== organization.coverImageUrl ? { coverImageUrl: coverValue ?? null } : {}),
      });
      if (coverFile) {
        const resized = await resizeCoverImage(coverFile);
        const formData = new FormData();
        formData.append("file", resized);
        await api.uploadFile(`/organizations/${organization.id}/cover`, formData);
      }
      notifySidebarChanged();
      onSaved();
      onClose();
    } catch {
      setError(t("Organizasyon güncellenemedi. Tekrar dene."));
      setLoading(false);
    }
  };

  return (
    <Modal title={t("Organizasyonu düzenle")} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Ad")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Açıklama")}</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Kısa açıklama (opsiyonel)")}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Bağlı olduğu grup (opsiyonel)</label>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ width: "100%" }}>
            <option value="">{t("Yok — tek başına organizasyon")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Ölçek")}</label>
          <select value={orgType} onChange={(e) => setOrgType(e.target.value as OrgType)} style={{ width: "100%" }}>
            {(Object.keys(ORG_TYPE_LABEL) as OrgType[]).map((type) => (
              <option key={type} value={type}>
                {ORG_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>

        <CoverPicker
          value={coverValue}
          seed={organization.id}
          filePreview={coverPreview}
          onSelectPreset={setCoverValue}
          onFile={handleCoverChange}
        />

        {/* Yetki gereği zaten kapalı sekmeler listelenmez: onları açıp
            kapatmanın bir karşılığı yok (bkz. OrgTabs.visibleOrgTabs). */}
        <TabVisibilitySection
          scope="organization"
          value={hiddenTabs}
          onChange={setHiddenTabs}
          unavailable={[
            ...(organization.viewerAccess?.canViewBudget === true ? [] : ["budget"]),
            ...(organization.viewerAccess?.canViewCommercial === false ? ["products"] : []),
          ]}
        />

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>

      <OrganizationStorageSection organizationId={organization.id} />

      {/* Şirketten ayrılma. Sahibinin yerinde (tehlikeli bölge) duruyor çünkü
          ikisi aynı sorunun iki cevabı: "bu şirketle işim bitti". Üye
          silemez/arşivleyemez, sahibi de ayrılamaz — bu yüzden ikisi birbirini
          dışlıyor. */}
      {!isOwner && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${c.border}` }}>
          <div style={{ fontSize: 15, color: c.textSecondary, marginBottom: 10 }}>
            {t("Ayrılırsan bu şirket ve departmanları listenden kalkar; işlerin ve dosyaların sende kalmaz.")}
          </div>
          <button
            type="button"
            onClick={() => setLeaving(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 14px",
              fontSize: 15,
              borderRadius: 8,
              border: `1px solid ${c.danger}`,
              background: "transparent",
              color: c.danger,
              cursor: "pointer",
            }}
          >
            <IconLogout size={16} color={c.danger} />
            {t("Şirketten ayrıl")}
          </button>
        </div>
      )}

      {leaving && (
        <ConfirmDialog
          title={t("Şirketten ayrıl")}
          message={t('"{sirket}" şirketinden ayrılmak istediğine emin misin? Departman kadrolarından da çıkarılırsın.', {
            sirket: organization.name,
          })}
          confirmLabel={t("Ayrıl")}
          danger
          onCancel={() => setLeaving(false)}
          onConfirm={async () => {
            setLeaving(false);
            await handleLeave();
          }}
        />
      )}

      {isOwner && (
        <EntityDangerZone
          entityLabel="Organizasyonu"
          resourcePath={`/organizations/${organization.id}`}
          affectsSidebar
          onArchive={onArchived ? handleArchive : undefined}
          onDelete={onDeleted ? handleDelete : undefined}
          archiveMessage={`"${organization.name}" organizasyonunu arşive eklemek istediğine emin misin? Bu organizasyona bağlı tüm projeler de arşive taşınır.`}
          deleteMessage={`"${organization.name}" organizasyonunu silmek istediğine emin misin? Bu organizasyona bağlı projelerin organizasyon bağlantısı kaldırılır (projeler silinmez). Bu işlem geri alınamaz.`}
        />
      )}
    </Modal>
  );
}
