import type { CSSProperties, ReactNode } from "react";
import type { Product } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { formatMiktar, formatPara, stokDurumu } from "../../lib/urunKarti";
import { coverBackground, isCoverPreset } from "../../lib/covers";
import type { UrunSiralama } from "../../lib/urunListesi";

// Katalog liste görünümü: binlerce ürünü göz gezdirerek taramanın, kod/barkod
// ve fiyat karşılaştırmanın yolu. Kart görünümünde ekrana 8-12 ürün sığıyor,
// burada 25-30. Başlığa tıklamak sıralamayı değiştirir (araç çubuğundaki
// sıralama seçicisiyle AYNI durum — iki ayrı sıralama tutulmuyor).

interface Props {
  urunler: Product[];
  siralama: UrunSiralama;
  onSirala: (s: UrunSiralama) => void;
  onOpen: (p: Product) => void;
  /** Dar ekranda kod/barkod/kategori sütunları gizlenir, ad altında özetlenir. */
  dar: boolean;
}

/** Sütun → [artan, azalan] sıralaması. İkinci tıklama yönü çevirir. */
const SUTUN_SIRASI = {
  ad: ["ad-artan", "ad-azalan"],
  kod: ["kod", "kod"],
  fiyat: ["fiyat-artan", "fiyat-azalan"],
  stok: ["stok-artan", "stok-azalan"],
} as const satisfies Record<string, readonly [UrunSiralama, UrunSiralama]>;

type Sutun = keyof typeof SUTUN_SIRASI;

export default function UrunTablosu({ urunler, siralama, onSirala, onOpen, dar }: Props) {
  const c = useThemeColors();
  const t = useT();

  const th: CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: c.surface,
    textAlign: "left",
    fontSize: 12.5,
    fontWeight: 600,
    color: c.textSecondary,
    padding: "9px 10px",
    borderBottom: `1px solid ${c.border}`,
    whiteSpace: "nowrap",
  };
  const td: CSSProperties = {
    padding: "7px 10px",
    fontSize: 14,
    color: c.textPrimary,
    borderBottom: `1px solid ${c.border}`,
    verticalAlign: "middle",
  };
  const tek: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  const baslik = (sutun: Sutun, metin: string, sag = false): ReactNode => {
    const [artan, azalan] = SUTUN_SIRASI[sutun];
    const etkin = siralama === artan || siralama === azalan;
    const ok = !etkin ? "" : artan === azalan ? " ↑" : siralama === artan ? " ↑" : " ↓";
    return (
      <th style={{ ...th, textAlign: sag ? "right" : "left" }} aria-sort={!etkin ? "none" : siralama === azalan && artan !== azalan ? "descending" : "ascending"}>
        <button
          type="button"
          onClick={() => onSirala(siralama === artan ? azalan : artan)}
          style={{ border: "none", background: "transparent", padding: 0, font: "inherit", color: etkin ? c.textPrimary : "inherit", cursor: "pointer" }}
        >
          {metin}
          {ok}
        </button>
      </th>
    );
  };

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", background: c.surface }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: dar ? 0 : 760 }}>
          <colgroup>
            <col style={{ width: 52 }} />
            <col />
            {!dar && <col style={{ width: 130 }} />}
            {!dar && <col style={{ width: 130 }} />}
            {!dar && <col style={{ width: 170 }} />}
            <col style={{ width: dar ? 96 : 120 }} />
            <col style={{ width: dar ? 76 : 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={th} aria-label={t("Fotoğraf")} />
              {baslik("ad", t("Ad"))}
              {!dar && baslik("kod", t("Stok kodu"))}
              {!dar && <th style={th}>{t("Barkod")}</th>}
              {!dar && <th style={th}>{t("Kategori · Marka")}</th>}
              {baslik("fiyat", t("Fiyat"), true)}
              {baslik("stok", t("Stok"), true)}
            </tr>
          </thead>
          <tbody>
            {urunler.map((p, i) => {
              const foto = p.coverImageUrl && !isCoverPreset(p.coverImageUrl) ? p.coverImageUrl : null;
              const durum = p.kind === "service" ? "yok" : stokDurumu(p.stockQuantity, p.minStock);
              const stokMetni = p.kind === "service" ? t("Hizmet") : formatMiktar(p.stockQuantity, p) ?? "—";
              const kunye = [p.category, p.brand].filter(Boolean).join(" · ");
              return (
                <tr
                  key={p.id}
                  onClick={() => onOpen(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(p);
                    }
                  }}
                  tabIndex={0}
                  className="urun-satiri"
                  style={{ cursor: "pointer", background: i % 2 ? c.listeSatirAlt : c.surface }}
                >
                  <td style={{ ...td, padding: "5px 6px 5px 10px" }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        overflow: "hidden",
                        background: foto ? c.background : coverBackground(p.coverImageUrl, p.id),
                      }}
                    >
                      {foto && <img src={foto} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ ...tek, fontWeight: 500 }} title={p.name}>
                      {p.name}
                    </div>
                    {(dar ? [p.sku, kunye].filter(Boolean).join(" · ") : p.status === "inactive") && (
                      <div style={{ ...tek, fontSize: 12.5, color: c.textSecondary }}>
                        {dar ? [p.sku, kunye].filter(Boolean).join(" · ") : null}
                        {p.status === "inactive" && (dar ? ` · ${t("Satış dışı")}` : t("Satış dışı"))}
                      </div>
                    )}
                  </td>
                  {!dar && (
                    <td style={{ ...td, ...tek, color: p.sku ? c.textPrimary : c.textSecondary }} title={p.sku}>
                      {p.sku || "—"}
                    </td>
                  )}
                  {!dar && (
                    <td style={{ ...td, ...tek, color: p.barcode ? c.textPrimary : c.textSecondary, fontVariantNumeric: "tabular-nums" }} title={p.barcode}>
                      {p.barcode || "—"}
                    </td>
                  )}
                  {!dar && (
                    <td style={{ ...td, ...tek, color: c.textSecondary, fontSize: 13 }} title={kunye}>
                      {kunye || "—"}
                    </td>
                  )}
                  <td style={{ ...td, ...tek, textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.price === undefined || p.price === null ? c.textSecondary : c.textPrimary }}>
                    {formatPara(p.price, p.currency) ?? "—"}
                  </td>
                  <td
                    style={{
                      ...td,
                      ...tek,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: durum === "tukendi" ? c.danger : durum === "kritik" ? c.warning : c.textSecondary,
                      fontWeight: durum === "tukendi" || durum === "kritik" ? 500 : 400,
                    }}
                  >
                    {stokMetni}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
