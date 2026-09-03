import { useRef, useState } from "react";
import { coverBackground } from "../lib/covers";
import { Link } from "react-router-dom";
import type { Project, ProjectStatus } from "@projelio/shared";
import { api } from "../api/client";
import { resizeCoverImage } from "../lib/imageProcessing";
import { useThemeColors } from "../theme/useThemeColors";
import CardDescription from "./CardDescription";
import { IconPlus } from "./icons";
import StatusBadge from "./StatusBadge";
import AskLioButton from "./AskLioButton";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { isProjectInSidebar } from "../lib/useSidebarHierarchy";

interface Props {
  project: Project;
  /**
   * Durum rozeti tıklanabilir olsun mu. Sunucuda kural "proje ya da iş sahibi"
   * (bkz. ProjectsService.assertCanManage); arayüzde de aynı kişiye açılıyor ki
   * kimse tıklayıp 403 ile karşılaşmasın.
   */
  canManage?: boolean;
  /**
   * Durum değişince güncel projeyi bildirir. `canManage` veriliyorsa bu da
   * verilmeli — kart durumu kendi state'inde tutmuyor, listedeki kayıt
   * tazelenmezse rozet eski değerde kalır.
   */
  onStatusChanged?: (project: Project) => void;
}

// Kartlar açıklama uzunluğuna ya da kapak fotoğrafı olup olmamasına göre boy
// değiştirmesin diye kapak alanı ve toplam kart yüksekliği HER ZAMAN sabittir
// (kart hiç büyümez/küçülmez — ör. kısa bir açıklama açıldığında kart daha
// önce boşluğa yayılan içerik kaybolunca küçülüyordu). Uzun açıklamalar 2
// satırda "…" ile kesilir; tıklanınca kartın boyutu değişmeden açıklama alanı
// kendi içinde kayarak (scroll) tam metni gösterir.
const COVER_HEIGHT = 104;
const CARD_HEIGHT = 280;

export default function ProjectCard({ project, canManage, onStatusChanged }: Props) {
  const c = useThemeColors();
  const [coverUrl, setCoverUrl] = useState(project.coverImageUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStatusChange = async (status: ProjectStatus) => {
    const updated = await api.patch<Project>(`/projects/${project.id}`, { status }).catch(() => null);
    if (!updated) return;
    // "Tamamlandı"/"Arşivlendi" projeyi sidebar ağacından düşürür, geri dönüş de
    // ekler; yalnızca görünürlük değiştiyse haber ver (bkz. lib/sidebarEvents.ts).
    if (isProjectInSidebar(project.status) !== isProjectInSidebar(updated.status)) notifySidebarChanged();
    onStatusChanged?.(updated);
  };

  const handleAddCoverClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleCoverSelected = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(false);
    try {
      const resized = await resizeCoverImage(file);
      const formData = new FormData();
      formData.append("file", resized);
      const updated = await api.uploadFile<Project>(`/projects/${project.id}/cover`, formData);
      setCoverUrl(updated.coverImageUrl);
    } catch {
      setUploadError(true);
      setTimeout(() => setUploadError(false), 3000);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Link
      to={`/projects/${project.id}`}
      draggable={false}
      className="entity-card"
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: c.surface,
        height: CARD_HEIGHT,
      }}
    >
      {/* Kapak: kullanıcı bir kapak koymadıysa kaydın kimliğinden türetilmiş hazır
          bir kapak çizilir — boş gri bir alan kartı ölü gösteriyordu (bkz. lib/covers). */}
      <div
        style={{
          position: "relative",
          height: COVER_HEIGHT,
          flexShrink: 0,
          background: coverBackground(coverUrl, project.id),
        }}
      >
        {/* Hızlı fotoğraf ekleme yalnızca kapak yokken gösterilir; kapak varsa
            değiştirmek için "Projeyi düzenle" ekranı kullanılır. */}
        {!coverUrl && (
          <button
            type="button"
            onClick={handleAddCoverClick}
            disabled={uploading}
            aria-label="Kapak fotoğrafı ekle"
            className="entity-card-cover-add"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: "none",
              background: "rgba(26,31,41,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconPlus size={16} color="#fff" />
          </button>
        )}

        {uploadError && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "4px 8px",
              fontSize: 12,
              color: "#fff",
              background: c.danger,
              textAlign: "center",
            }}
          >
            Yüklenemedi, tekrar dene
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            void handleCoverSelected(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 500,
              color: c.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {project.title}
          </h3>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <StatusBadge status={project.status} onChange={canManage ? handleStatusChange : undefined} />
            <AskLioButton subject={{ kind: "proje", title: project.title, id: project.id }} size={24} />
          </span>
        </div>
        {project.description && (
          <CardDescription text={project.description} />
        )}

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 15,
            paddingTop: 10,
            borderTop: `1px solid ${c.border}`,
          }}
        >
          <span style={{ color: c.accentDark, fontWeight: 500 }}>
            {project.totalBudget.toLocaleString("tr-TR")} ₺
          </span>
          <span style={{ color: c.textSecondary }}>
            {new Date(project.deadline).toLocaleDateString("tr-TR")}
          </span>
        </div>
      </div>
    </Link>
  );
}
