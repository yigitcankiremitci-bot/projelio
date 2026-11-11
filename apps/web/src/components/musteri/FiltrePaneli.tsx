import { useState, type CSSProperties, type ReactNode } from "react";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";

/**
 * Müşteriler ve Tahsilat'ın soldaki ayrıntılı filtre paneli (kullanıcı isteği,
 * 2026-11-11). Geniş ekranda listenin solunda sabit durur, dar ekranda aynı
 * içerik "Süz" penceresinde açılır. Panelde kaydırma çubuğu yok: uzun seçenek
 * listeleri ilk birkaç seçenekle başlar, "Tümünü göster" ile açılır.
 */
export function filtrePaneliStili(c: ReturnType<typeof useThemeColors>): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: "16px 16px 18px",
    borderRadius: 12,
    background: c.surface,
    border: `1px solid ${c.border}`,
  };
}

/** Panelin başlığı: "Filtreler" + etkin filtre varsa "Temizle". */
export function FiltreBasligi({ etkin, onTemizle }: { etkin: number; onTemizle: () => void }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary, flex: 1 }}>
        {t("Filtreler")}
        {etkin > 0 && <span style={{ marginLeft: 6, fontSize: 13, fontWeight: 500, color: c.primary }}>({etkin})</span>}
      </span>
      {etkin > 0 && (
        <button onClick={onTemizle} style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
          {t("Temizle")}
        </button>
      )}
    </div>
  );
}

export function FiltreBolumu({ baslik, children }: { baslik: string; children: ReactNode }) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", color: c.textSecondary }}>{baslik}</span>
      {children}
    </div>
  );
}

export type FiltreSecenegi = { deger: string; etiket: string; sayi?: number; renk?: string };

/**
 * Tıklanabilir seçenek satırları (sağda sayı). `coklu` ise birden çok seçilir;
 * değilse seçili olana yeniden basmak seçimi kaldırır.
 */
export function SecimListesi({
  secenekler,
  secili,
  onDegis,
  coklu,
  ilkGoster = 6,
}: {
  secenekler: FiltreSecenegi[];
  secili: string[];
  onDegis: (yeni: string[]) => void;
  coklu?: boolean;
  ilkGoster?: number;
}) {
  const c = useThemeColors();
  const t = useT();
  const [hepsi, setHepsi] = useState(false);
  // Seçili olanlar kısaltılmış listede de görünsün.
  const gorunen = hepsi
    ? secenekler
    : secenekler.filter((s, i) => i < ilkGoster || secili.includes(s.deger));
  const sec = (d: string) => {
    const var_ = secili.includes(d);
    if (coklu) onDegis(var_ ? secili.filter((x) => x !== d) : [...secili, d]);
    else onDegis(var_ ? [] : [d]);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {gorunen.map((s) => {
        const aktif = secili.includes(s.deger);
        return (
          <button
            key={s.deger}
            onClick={() => sec(s.deger)}
            aria-pressed={aktif}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 7,
              border: "none",
              background: aktif ? `color-mix(in srgb, ${c.primary} 18%, ${c.surface})` : "transparent",
              color: aktif ? c.textPrimary : s.renk ?? c.textPrimary,
              fontSize: 14,
              fontWeight: aktif ? 600 : 400,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                flexShrink: 0,
                borderRadius: coklu ? 4 : 999,
                border: `1.5px solid ${aktif ? c.primary : c.border}`,
                background: aktif ? c.primary : "transparent",
              }}
            />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.etiket}</span>
            {s.sayi !== undefined && (
              <span style={{ fontSize: 12, color: c.textSecondary, fontVariantNumeric: "tabular-nums" }}>{s.sayi}</span>
            )}
          </button>
        );
      })}
      {secenekler.length > ilkGoster && (
        <button
          onClick={() => setHepsi((h) => !h)}
          style={{ alignSelf: "flex-start", marginTop: 2, padding: "4px 8px", fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
        >
          {hepsi ? t("Daha az göster") : t("Tümünü göster ({n})", { n: secenekler.length })}
        </button>
      )}
    </div>
  );
}

/** Baş harf ızgarası: yalnızca listede olan harfler basılabilir. */
export function HarfIzgarasi({ sayilar, secili, onSec }: { sayilar: Map<string, number>; secili: string; onSec: (h: string) => void }) {
  const c = useThemeColors();
  const harfler = [...TR_ALFABE, ...(sayilar.has("#") ? ["#"] : [])];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
      {harfler.map((h) => {
        const sayi = sayilar.get(h) ?? 0;
        const aktif = secili === h;
        return (
          <button
            key={h}
            disabled={!sayi && !aktif}
            onClick={() => onSec(aktif ? "" : h)}
            title={sayi ? String(sayi) : undefined}
            style={{
              height: 30,
              borderRadius: 7,
              border: `1px solid ${aktif ? c.primary : "transparent"}`,
              background: aktif ? c.primary : sayi ? c.background : "transparent",
              color: aktif ? c.onPrimary : sayi ? c.textPrimary : c.textSecondary,
              opacity: sayi || aktif ? 1 : 0.35,
              fontSize: 13,
              fontWeight: 600,
              cursor: sayi ? "pointer" : "default",
            }}
          >
            {h}
          </button>
        );
      })}
    </div>
  );
}

const TR_ALFABE = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");

/** Adın ilk harfi (Türkçe büyük harf); harfle başlamayan ad "#". */
export function basHarf(ad: string): string {
  const h = ad.replace(/^[^\p{L}\d]+/u, "").charAt(0).toLocaleUpperCase("tr");
  return h && TR_ALFABE.includes(h) ? h : "#";
}

/** Değerleri sayar, çoktan aza (eşitse alfabetik) seçenek listesi üretir. */
export function sayarakSecenekler(degerler: (string | undefined)[]): FiltreSecenegi[] {
  const m = new Map<string, number>();
  for (const d of degerler) if (d) m.set(d, (m.get(d) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))
    .map(([deger, sayi]) => ({ deger, etiket: deger, sayi }));
}
