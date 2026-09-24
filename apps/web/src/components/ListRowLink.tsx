import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useThemeColors } from "../theme/useThemeColors";
import { IconChevronRight } from "./icons";

interface Props {
  to?: string;
  /** Adres yerine eylem (ör. modülü yerinde, pencerede açmak). `to` varsa o kazanır. */
  onClick?: () => void;
  icon?: ReactNode;
  label: string;
  /** Sağda, okun solunda duran kısa bilgi (ör. "4 kişi"). */
  trailing?: ReactNode;
  /**
   * Satırın zemini olarak kapak (CSS background, bkz. lib/covers
   * coverBackground). Verilirse üstüne koyu bir perde çekilir ve yazı beyaza
   * döner — kapak ne renk olursa olsun okunur kalsın diye.
   */
  background?: string;
  /**
   * Simge satırın solunda dolgusuz, satır boyunca TAM YÜKSEKLİKTE durur
   * (modül simgeleri). Simgenin kendisi ROW_INNER_HEIGHT boyunda çizilmeli.
   */
  iconBleed?: boolean;
}

const ROW_HEIGHT = 50;
/** Satırın 1 px'lik çerçevesi düşülünce kalan iç yükseklik — tam boy simge bu ölçüde çizilir. */
export const ROW_INNER_HEIGHT = ROW_HEIGHT - 2;

/**
 * Telefonda anasayfa özetlerinin (departmanlar, modüller) tek satırlık hâli.
 *
 * Neden kart değil: 260 px'lik kapaklı kartlar yana kaydırmalı bir şerit
 * oluşturuyordu ve telefonda anasayfa üç ayrı yatay şerit + kapak + kişi
 * kartından ibaret, karmaşık bir yığına dönüşüyordu. Tek satırlık düğmeler
 * alt alta dizilince hepsi bir bakışta görünüyor ve parmakla vurması kolay.
 */
export default function ListRowLink({ to, onClick, icon, label, trailing, background, iconBleed = false }: Props) {
  const c = useThemeColors();
  const onCover = Boolean(background);
  const textColor = onCover ? "#fff" : c.textPrimary;
  const mutedColor = onCover ? "rgba(255,255,255,0.8)" : c.textSecondary;
  const content = (
    <>
      {icon && <span style={{ display: "flex", flexShrink: 0, alignSelf: iconBleed ? "stretch" : undefined }}>{icon}</span>}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 15,
          fontWeight: 500,
          color: textColor,
          whiteSpace: "nowrap",
          textShadow: onCover ? "0 1px 3px rgba(0,0,0,0.45)" : undefined,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      {trailing && (
        <span style={{ flexShrink: 0, fontSize: 13, color: mutedColor, display: "flex", alignItems: "center", gap: 4 }}>
          {trailing}
        </span>
      )}
      {(to || onClick) && <IconChevronRight size={16} color={mutedColor} />}
    </>
  );
  const style = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: onCover ? 54 : ROW_HEIGHT,
    padding: iconBleed ? "0 14px 0 0" : "8px 14px",
    overflow: "hidden",
    borderRadius: 12,
    border: `1px solid ${c.border}`,
    // Perde soldan sağa açılır: yazının oturduğu sol taraf koyu, sağda
    // kapağın kendisi görünür.
    background: onCover
      ? `linear-gradient(90deg, rgba(20,24,32,0.82) 0%, rgba(20,24,32,0.55) 55%, rgba(20,24,32,0.3) 100%), ${background}`
      : c.surface,
    textDecoration: "none",
  } as const;
  return to ? (
    <Link to={to} draggable={false} style={style}>
      {content}
    </Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} style={{ ...style, width: "100%", textAlign: "left", cursor: "pointer" }}>
      {content}
    </button>
  ) : (
    <div style={style}>{content}</div>
  );
}

/** Satırları alt alta dizen sarmalayıcı — iki panel aynı aralığı kullansın. */
export function ListRowStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
}
