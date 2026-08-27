import { useThemeColors } from "../theme/useThemeColors";
import { Z } from "../lib/layout";
import { usePresence } from "../lib/liveRoom";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useIsDesktop } from "../lib/useIsDesktop";

/**
 * "Bu sayfada başka kim var" şeridi — sol altta, ince bir hap.
 *
 * NEDEN SOL ALT: sağ üst köşe zaten kalabalık (bildirim çanı, sesli tur) ve
 * oraya konulan sabit öğe hem çakışıyor hem de gözün sürekli gittiği yerde
 * duruyor. Bu bilgi arka plan bilgisi: lazım olduğunda okunur, sürekli dikkat
 * çekmesi gerekmez.
 *
 * Kendisi listeden çıkarılır — "yanımda kim var" sorusunun cevabı diğerleri.
 * Kimse yoksa hiç çizilmez; tek başına çalışan kullanıcının ekranında fazladan
 * bir şey durmasın.
 */
export default function PresenceStrip({ left = 0 }: { left?: number }) {
  const c = useThemeColors();
  const isDesktop = useIsDesktop();
  const users = usePresence();
  const { user: me } = useCurrentUser();
  const others = users.filter((u) => u.userId !== me?.id);
  if (others.length === 0) return null;

  const names = others.map((u) => u.fullName ?? "Bir kullanıcı");
  // Uzun ekip listelerinde şerit satır satır büyümesin: en fazla iki isim.
  const text =
    names.length === 1
      ? `${names[0]} bu sayfada`
      : names.length === 2
      ? `${names[0]} ve ${names[1]} bu sayfada`
      : `${names[0]} ve ${names.length - 1} kişi daha bu sayfada`;

  return (
    <div
      // Kenar çubuğu açıkken içeriğin sol kenarına hizalanır (left=SIDEBAR_WIDTH);
      // telefonda alt menünün (68 px + safe-area) üstünde durur.
      style={{
        position: "fixed",
        left: left + 16,
        // Telefonda alt menü (68 px) + çentik boşluğunun üstünde kalmalı.
        bottom: isDesktop ? 16 : "calc(84px + env(safe-area-inset-bottom))",
        zIndex: Z.presenceStrip,
        display: "flex",
        alignItems: "center",
        gap: 7,
        maxWidth: "min(320px, calc(100vw - 32px))",
        padding: "6px 11px",
        borderRadius: 999,
        background: c.surface,
        border: `1px solid ${c.border}`,
        boxShadow: "0 2px 10px rgba(26,31,41,0.10)",
        fontSize: 12,
        color: c.textSecondary,
        // Altındaki içeriğe tıklamayı engellemesin: şerit yalnızca bilgi.
        pointerEvents: "none",
      }}
      title={names.join(", ")}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: c.success,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    </div>
  );
}
