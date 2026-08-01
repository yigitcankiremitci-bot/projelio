import { useEffect, useState } from "react";
import type { User } from "@projelio/shared";
import { resolveUserTitle } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { useIsDesktop } from "../lib/useIsDesktop";
import { IconUser, IconSettings } from "./icons";
import EditProfileModal from "./EditProfileModal";

const AVATAR_SIZE = 116;
const RING_PADDING = 4;

// Anasayfada sağ üstte gösterilen kişi kartı: koyu bir "kapsül" içinde sağa dayalı
// ad/görev/açıklama, kapsülün üstüne bindirilmiş büyük yuvarlak bir profil fotoğrafı ile
// birleşiyor — alışılmış dikdörtgen kart yerine iç içe geçen tek bir kompozisyon.
// Masaüstünde kartın üzerine gelince tüm kompozisyon hafifçe büyür ve fotoğrafın tam
// üstünde düzenleme simgesi belirir; dokunmatikte hover olmadığı için fotoğrafa
// dokunmak aynı simgeyi açar.
export default function ProfileCard() {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  const [user, setUser] = useState<User | null>(null);
  const [hovered, setHovered] = useState(false);
  // Ayar simgesi yalnızca imleç fotoğrafın üstündeyken görünür; kartın geri kalanında
  // gezinmek yeterli değil.
  const [avatarHovered, setAvatarHovered] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [editing, setEditing] = useState(false);

  const reload = () => {
    api.get<User>("/auth/me").then(setUser).catch(() => setUser(null));
  };

  useEffect(reload, []);

  if (!user) return null;

  const gearVisible = isDesktop ? avatarHovered : tapped;
  // Modal açıkken kart normal boyutuna dönsün — arkada büyümüş halde durması dikkat dağıtıyor.
  const active = isDesktop && hovered && !editing;

  return (
    <div
      onMouseEnter={() => isDesktop && setHovered(true)}
      onMouseLeave={() => isDesktop && setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        // Sağ üstte durduğu için sağ kenarı sabit tutup sola/aşağı doğru büyütüyoruz;
        // aksi halde büyüyünce sayfa kenarından taşardı.
        transformOrigin: "right center",
        transform: active ? "scale(1.15)" : "scale(1)",
        transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* Sağa dayalı bilgi kapsülü — sağ tarafı avatarın altına girecek şekilde kısaltılmış. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          textAlign: "right",
          gap: 3,
          background: `linear-gradient(120deg, ${c.primary}, ${c.primaryDark})`,
          borderRadius: "999px 22px 22px 999px",
          padding: `14px ${AVATAR_SIZE / 2 + 26}px 14px 24px`,
          marginRight: -(AVATAR_SIZE / 2 + RING_PADDING),
          maxWidth: 260,
          boxShadow: active ? "0 12px 28px rgba(28,34,44,0.26)" : "0 6px 18px rgba(28,34,44,0.18)",
          transition: "box-shadow 620ms ease",
        }}
      >
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {user.fullName}
        </div>
        {/* Unvan her zaman görünür: kullanıcı kendi metnini yazmadıysa hesap tipinden türetilir. */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: c.primaryDark,
            background: c.accent,
            padding: "2px 10px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {resolveUserTitle(user)}
        </div>
        {user.bio && (
          <div
            style={{
              fontSize: 12.5,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.4,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            }}
          >
            {user.bio}
          </div>
        )}
      </div>

      {/* Büyük, kapsülün üstüne binen yuvarlak profil fotoğrafı. */}
      <div
        onClick={() => !isDesktop && setTapped((prev) => !prev)}
        onMouseEnter={() => isDesktop && setAvatarHovered(true)}
        onMouseLeave={() => isDesktop && setAvatarHovered(false)}
        role="button"
        tabIndex={0}
        onFocus={() => {
          setHovered(true);
          setAvatarHovered(true);
        }}
        onBlur={() => {
          setHovered(false);
          setAvatarHovered(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
        aria-label="Profil fotoğrafı"
        style={{
          position: "relative",
          zIndex: 2,
          flexShrink: 0,
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: "50%",
          padding: RING_PADDING,
          background: `linear-gradient(135deg, ${c.accent}, ${c.accentDark})`,
          boxShadow: active ? "0 14px 30px rgba(28,34,44,0.36)" : "0 8px 20px rgba(28,34,44,0.28)",
          transition: "box-shadow 620ms ease",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            overflow: "hidden",
            background: c.surface,
            border: `3px solid ${c.surface}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <IconUser size={44} color={c.textSecondary} />
          )}
        </div>

        {/* Düzenleme simgesi fotoğrafın tam üstünde, hafif karartılmış bir katman içinde. */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setTapped(false);
            setEditing(true);
          }}
          role="button"
          aria-label="Profili düzenle"
          style={{
            position: "absolute",
            inset: RING_PADDING + 3,
            borderRadius: "50%",
            background: "rgba(26,31,41,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: gearVisible ? 1 : 0,
            pointerEvents: gearVisible ? "auto" : "none",
            transition: "opacity 200ms ease",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.16)",
              border: "1.5px solid rgba(255,255,255,0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: gearVisible ? "scale(1)" : "scale(0.7)",
              transition: "transform 240ms cubic-bezier(0.34, 1.4, 0.64, 1)",
            }}
          >
            <IconSettings size={20} color="#fff" />
          </span>
        </div>
      </div>

      {editing && <EditProfileModal user={user} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  );
}
