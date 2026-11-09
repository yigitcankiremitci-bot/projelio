import type { ReactNode, Ref } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useThemeColors } from "../../theme/useThemeColors";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { pageGutter, safeTop, TOP_CHROME } from "../../lib/layout";
import { IconChevronLeft } from "../icons";

/**
 * Anasayfaların (kapak yerine geçen) en üst satırı: başlık, sayfanın en
 * tepesinde, yüzen düğmelerle AYNI bantta durur.
 *
 * Soldaki pay App.tsx'in verdiği --ust-sol-bosluk: kenar çubuğu kapalıyken sol
 * üstte açma oku var, başlık onun altına girmemeli; açıkken pay sıfırlanır ve
 * başlık sayfa dolgusuna hizalanır. Sağdaki pay bildirim çanı + yardım düğmesi.
 */
const SAG_DUGME_PAYI = 118;

export function GeriDugmesi({
  to,
  etiket,
  geriGit,
}: {
  to: string;
  etiket: string;
  geriGit?: boolean;
}) {
  const c = useThemeColors();
  const navigate = useNavigate();
  return (
    <div style={{ flexShrink: 0 }}>
      <Link
        to={to}
        aria-label={etiket}
        title={etiket}
        onClick={(e) => {
          if (!geriGit) return;
          e.preventDefault();
          navigate(-1);
        }}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${c.border}`,
          background: c.surface,
        }}
      >
        <IconChevronLeft size={15} color={c.textSecondary} />
      </Link>
    </div>
  );
}

export default function AnasayfaBaslik({
  baslik,
  baslikRef,
  geri,
  araclar,
}: {
  baslik: string;
  baslikRef?: Ref<HTMLDivElement>;
  geri?: ReactNode;
  araclar?: ReactNode;
}) {
  const c = useThemeColors();
  const isDesktop = useIsDesktop();
  const gutter = pageGutter(isDesktop);
  return (
    <div ref={baslikRef} style={{ marginBottom: isDesktop ? 18 : 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: TOP_CHROME.size,
          paddingTop: safeTop(TOP_CHROME.top),
          paddingLeft: `max(${gutter}px, var(--ust-sol-bosluk, 0px))`,
          paddingRight: SAG_DUGME_PAYI,
          boxSizing: "content-box",
        }}
      >
        {geri}
        <h1
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            fontSize: isDesktop ? 22 : 19,
            fontWeight: 500,
            color: c.textPrimary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {baslik}
        </h1>
        {isDesktop && araclar && <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{araclar}</div>}
      </div>
      {/* Telefonda bantta yer yok: başlık ile iki yandaki düğmeler onu dolduruyor. */}
      {!isDesktop && araclar && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: `8px ${gutter}px 0` }}>{araclar}</div>
      )}
    </div>
  );
}
