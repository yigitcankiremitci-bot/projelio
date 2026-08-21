import { useState } from "react";
import type { User } from "@projelio/shared";
import { DEFAULT_TITLE_BY_ACCOUNT_TYPE } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { cropAvatarImage } from "../lib/imageProcessing";
import type { CropArea } from "../lib/imageProcessing";
import Modal from "./Modal";
import AvatarCropper from "./AvatarCropper";
import { IconUser } from "./icons";

interface Props {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditProfileModal({ user, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const [fullName, setFullName] = useState(user.fullName);
  const [title, setTitle] = useState(user.title ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<CropArea | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Unvan alanı boş bırakılırsa hesap tipine göre otomatik atanan unvan gösterilir.
  const autoTitle = DEFAULT_TITLE_BY_ACCOUNT_TYPE[user.accountType ?? "freelancer"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.patch("/users/me/profile", {
        fullName,
        // Boş gönderirsek sunucu null'a çeker; bu da "otomatik unvana dön" demek.
        title,
        bio,
      });
      if (avatarFile && crop) {
        const cropped = await cropAvatarImage(avatarFile, crop);
        const formData = new FormData();
        formData.append("file", cropped);
        await api.uploadFile("/users/me/avatar", formData);
      }
      onSaved();
      onClose();
    } catch {
      setError("Profil güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Profili düzenle" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 4 }}>
          {avatarFile ? (
            <AvatarCropper file={avatarFile} onChange={setCrop} />
          ) : (
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                overflow: "hidden",
                background: c.background,
                border: `1px solid ${c.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <IconUser size={32} color={c.textSecondary} />
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <label style={{ fontSize: 14, color: c.accentDark, fontWeight: 500, cursor: "pointer" }}>
              {avatarFile ? "Başka fotoğraf seç" : "Fotoğraf değiştir"}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setAvatarFile(e.target.files?.[0] ?? null);
                  setCrop(null);
                }}
                style={{ display: "none" }}
              />
            </label>
            {avatarFile && (
              <button
                type="button"
                onClick={() => {
                  setAvatarFile(null);
                  setCrop(null);
                }}
                style={{ background: "transparent", border: "none", padding: 0, fontSize: 14, color: c.textSecondary }}
              >
                Vazgeç
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Ad soyad</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Görev / unvan</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={autoTitle}
            maxLength={80}
            style={{ width: "100%" }}
          />
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            Boş bırakırsan üyelik tipine göre "{autoTitle}" olarak görünür.
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Kısa açıklama</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Kendini kısaca tanıt (opsiyonel)"
            maxLength={280}
            rows={3}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
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
    </Modal>
  );
}
