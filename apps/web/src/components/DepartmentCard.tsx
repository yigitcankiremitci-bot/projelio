import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Department } from "@projelio/shared";
import { api } from "../api/client";
import { resizeCoverImage } from "../lib/imageProcessing";
import { getDepartmentCoverUrl } from "../lib/departmentCovers";
import { useThemeColors } from "../theme/useThemeColors";
import CardDescription from "./CardDescription";
import { IconLayers, IconUser, IconEdit } from "./icons";
import AskLioButton from "./AskLioButton";

interface Props {
  department: Department;
  onCoverUpdated?: (coverImageUrl?: string) => void;
}

// JobCard ile aynı görsel dil (kapak + başlık + açıklama + alt bilgi çubuğu) —
// "departman görünümü iş kartları görünümü gibi olsun". Karta tıklamak
// departmanın kendi sayfasına (kadro + varsa ürünler) götürür. Yükseklik
// JobCard ile birebir aynı: sabit ve içeriğe (uzun başlık/açıklama) rağmen
// metinlerin taşmaması/sıkışmaması için yeterince ferah.
//
// Kapak fotoğrafı: özel yüklenmemişse 10 standart departmandan biriyse otomatik
// bir varsayılan kapak gösterilir (bkz. lib/departmentCovers.ts). Köşedeki kalem
// simgesi her zaman görünür — "istenildiğinde değiştirilebilsin" isteği; kapağı
// tamamen kaldırma seçeneği departman sayfasının kendisinde (bkz.
// DepartmentDetail.tsx), çünkü kaldırınca varsayılana dönüş orada anlatılıyor.
// Kapak yüksekliği JobCard/ProductCard'a göre ~%40 daha büyük — "kapaklar daha
// görünür olsun" isteği; toplam kart yüksekliği de aynı farkla artırıldı ki
// alt içerik alanı (başlık/açıklama/kişi sayısı) sıkışmasın.
const COVER_HEIGHT = 146;
const CARD_HEIGHT = 338;

export default function DepartmentCard({ department, onCoverUpdated }: Props) {
  const c = useThemeColors();
  const [coverUrl, setCoverUrl] = useState(getDepartmentCoverUrl(department));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChangeCoverClick = (e: React.MouseEvent) => {
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
      const updated = await api.uploadFile<Department>(`/departments/${department.id}/cover`, formData);
      setCoverUrl(updated.coverImageUrl);
      onCoverUpdated?.(updated.coverImageUrl);
    } catch {
      setUploadError(true);
      setTimeout(() => setUploadError(false), 3000);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Link
      to={`/departments/${department.id}`}
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
      <div
        style={{
          position: "relative",
          height: COVER_HEIGHT,
          flexShrink: 0,
          background: coverUrl ? `center/cover url(${coverUrl})` : c.background,
          display: coverUrl ? undefined : "flex",
          alignItems: coverUrl ? undefined : "center",
          justifyContent: coverUrl ? undefined : "center",
        }}
      >
        {!coverUrl && <IconLayers size={26} color={c.border} />}

        <button
          type="button"
          onClick={handleChangeCoverClick}
          disabled={uploading}
          aria-label="Kapak fotoğrafını değiştir"
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
          <IconEdit size={14} color="#fff" />
        </button>

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
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "0 0 6px" }}>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 500,
              color: c.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {department.name}
          </h3>
          <AskLioButton subject={{ kind: "departman", title: department.name, id: department.id }} size={24} />
        </div>
        {department.description && (
          <CardDescription text={department.description} lines={3} />
        )}

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
          <IconUser size={13} color={c.textSecondary} />
          <span>{department.memberCount ?? 0} kişi</span>
        </div>
      </div>
    </Link>
  );
}
