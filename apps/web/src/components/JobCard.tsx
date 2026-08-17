import { useRef, useState } from "react";
import { coverBackground } from "../lib/covers";
import { Link } from "react-router-dom";
import type { Job } from "@projelio/shared";
import { api } from "../api/client";
import { resizeCoverImage } from "../lib/imageProcessing";
import { colors } from "../theme/colors";
import { IconFolder, IconUser, IconCalendar, IconPlus } from "./icons";

interface Props {
  job: Job;
  projectCount: number;
}

// Kartlar açıklama uzunluğuna ya da kapak fotoğrafı olup olmamasına göre boy
// değiştirmesin diye kapak alanı ve toplam kart yüksekliği HER ZAMAN sabittir
// (kart hiç büyümez/küçülmez — ör. kısa bir açıklama açıldığında kart daha
// önce boşluğa yayılan içerik kaybolunca küçülüyordu). Uzun açıklamalar 2
// satırda "…" ile kesilir; tıklanınca kartın boyutu değişmeden açıklama alanı
// kendi içinde kayarak (scroll) tam metni gösterir.
const COVER_HEIGHT = 104;
const CARD_HEIGHT = 296;

export default function JobCard({ job, projectCount }: Props) {
  const c = colors.light;
  const [expanded, setExpanded] = useState(false);
  const [coverUrl, setCoverUrl] = useState(job.coverImageUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleExpanded = (e: React.MouseEvent) => {
    // İçindeyken Link'e tıklanmış gibi işe yönlendirmesin — sadece açıklamayı büyüt/küçült.
    e.preventDefault();
    e.stopPropagation();
    setExpanded((prev) => !prev);
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
      const updated = await api.uploadFile<Job>(`/jobs/${job.id}/cover`, formData);
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
      to={`/jobs/${job.id}`}
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
      {/* Kapak: fotoğraf yoksa bile aynı yükseklikte, açık renkli bir yer tutucu ile gösterilir. */}
      <div
        style={{
          position: "relative",
          height: COVER_HEIGHT,
          flexShrink: 0,
          background: coverUrl ? coverBackground(coverUrl) : c.background,
          display: coverUrl ? undefined : "flex",
          alignItems: coverUrl ? undefined : "center",
          justifyContent: coverUrl ? undefined : "center",
        }}
      >
        {!coverUrl && <IconFolder size={26} color={c.border} />}

        {/* Hızlı fotoğraf ekleme yalnızca kapak yokken gösterilir; kapak varsa
            değiştirmek için "İşi düzenle" ekranı kullanılır. */}
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
        <h3
          style={{
            margin: "0 0 6px",
            fontSize: 17,
            fontWeight: 500,
            color: c.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {job.title}
        </h3>
        {job.description && (
          <p
            onClick={toggleExpanded}
            title={expanded ? undefined : "Tamamını görmek için tıkla"}
            style={{
              color: c.textSecondary,
              fontSize: 15,
              margin: "0 0 10px",
              lineHeight: 1.5,
              cursor: "pointer",
              minHeight: 0,
              ...(expanded
                ? { flex: 1, overflowY: "auto" as const }
                : {
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                  }),
            }}
          >
            {job.description}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, color: c.textSecondary, marginBottom: 10 }}>
          {job.ownerName && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconUser size={12} color={c.textSecondary} />
              <span>{job.ownerName}</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconCalendar size={12} color={c.textSecondary} />
            <span>{new Date(job.createdAt).toLocaleDateString("tr-TR")} kuruldu</span>
          </div>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 15,
            paddingTop: 10,
            borderTop: `1px solid ${c.border}`,
            color: c.textSecondary,
          }}
        >
          <IconFolder size={13} color={c.textSecondary} />
          <span>{projectCount} proje</span>
        </div>
      </div>
    </Link>
  );
}
