import type { CSSProperties, ReactNode, RefObject } from "react";
import {
  COVER_TEXT_PRIMARY,
  COVER_TEXT_SECONDARY,
  COVER_TEXT_VEIL,
  COVER_VEIL_HEIGHT,
  coverBackground,
} from "../lib/covers";
import { useIsDesktop } from "../lib/useIsDesktop";

/**
 * Kapağın sağ alt köşesindeki düzenleme düğmesinin ortak stili — beş sayfada
 * ayrı ayrı kopyalanmıştı.
 */
export function coverActionButton(c: { border: string; surface: string }): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 10,
    border: `1px solid ${c.border}`,
    background: c.surface,
    boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
  };
}

interface Props {
  /** Kaydırınca beliren sabit başlık bunu ölçer (bkz. lib/pageHeader). */
  coverRef?: RefObject<HTMLDivElement>;
  coverImageUrl?: string;
  height?: number;
  title: ReactNode;
  description?: string;
  /** Başlığın altındaki tek satırlık künye (sahip, tarih, tutar…). */
  meta?: ReactNode;
  /** Sağ üstteki kişi kartı. Dar ekranda gösterilmez — başlığı eziyordu. */
  aside?: ReactNode;
  /** Sağ alttaki düzenleme düğmesi. */
  action?: ReactNode;
}

/**
 * İş / şirket / grup / proje / rutin sayfalarının ortak kapak başlığı.
 *
 * Önceden her sayfa bu bloğu kendi içinde kopyalıyordu ve iki hata beş yerde
 * birden yaşıyordu:
 *
 *  1. Kapak yokken arka plan koyu bir gradyandı, yazı rengi ise koyu kalıyordu —
 *     başlık ve açıklama görünmüyordu. Artık arka plan ne olursa olsun yazının
 *     oturduğu bant beyaz bir perdeyle açılıyor (bkz. lib/covers.ts).
 *  2. Kişi kartı mutlak konumdaydı, başlık bloğuysa sabit bir sağ boşluğa
 *     güveniyordu; açıklama uzayınca kartın altına giriyordu. Artık kart ile
 *     yazı aynı satırın iki sütunu — çakışma yapısal olarak imkânsız.
 */
export default function EntityCover({
  coverRef,
  coverImageUrl,
  height = 290,
  title,
  description,
  meta,
  aside,
  action,
}: Props) {
  const isDesktop = useIsDesktop();
  const showAside = Boolean(aside) && isDesktop;

  return (
    <div
      ref={coverRef}
      style={{
        position: "relative",
        height,
        background: coverBackground(coverImageUrl),
        padding: "20px 28px",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Yazı perdesi: kapağın alt kısmını beyaza doğru açar. Üst kısım kapağın
          kendisi olarak kalır, yani seçilen görsel/gradyan görünmeye devam eder. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: COVER_VEIL_HEIGHT,
          background: COVER_TEXT_VEIL,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          gap: 20,
          width: "100%",
          alignItems: "stretch",
          color: COVER_TEXT_SECONDARY,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: COVER_TEXT_PRIMARY, margin: "0 0 4px" }}>{title}</h1>
          {description && (
            <p
              style={{
                fontSize: 16,
                color: COVER_TEXT_SECONDARY,
                margin: "0 0 8px",
                // Uzun açıklama kapağı taşırmasın: iki satırda kırpılır.
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={description}
            >
              {description}
            </p>
          )}
          {meta && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15, color: COVER_TEXT_SECONDARY }}>
              {meta}
            </div>
          )}
        </div>

        {(showAside || action) && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: showAside ? "space-between" : "flex-end",
            }}
          >
            {showAside ? aside : null}
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
