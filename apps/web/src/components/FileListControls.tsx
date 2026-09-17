import type { ReactNode } from "react";
import { FILE_SORT_KEYS, type FileSortKey } from "../lib/fileSort";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  sort: FileSortKey;
  onSortChange: (key: FileSortKey) => void;
  /** Arama kutusunun ipucu — ekran neyin içinde aradığını söylesin. */
  placeholder?: string;
  /** Satırın sonuna eklenecek düğmeler (ör. liste/simge anahtarı). */
  children?: ReactNode;
}

/**
 * Dosya ekranlarının arama kutusu + sıralama seçimi (bkz. lib/fileSort.ts).
 *
 * Tıklama kabarması durduruluyor: panelin kökünde "boşluğa tıklayınca seçimi
 * bırak" ve kement dinleyicileri var, kutuya tıklamak onları tetiklememeli.
 */
export default function FileListControls({ query, onQueryChange, sort, onSortChange, placeholder, children }: Props) {
  const c = useThemeColors();
  const t = useT();
  const etiket: Record<FileSortKey, string> = {
    "date-desc": t("Eklenme: en yeni"),
    "date-asc": t("Eklenme: en eski"),
    "name-asc": t("Ad: A → Z"),
    "name-desc": t("Ad: Z → A"),
    "size-desc": t("Boyut: en büyük"),
    "size-asc": t("Boyut: en küçük"),
  };
  const alan = {
    padding: "8px 11px",
    borderRadius: 9,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 15,
  } as const;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
    >
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onQueryChange("");
        }}
        placeholder={placeholder ?? t("Dosya ara…")}
        aria-label={t("Dosya ara")}
        style={{ ...alan, flex: "1 1 200px", minWidth: 0 }}
      />
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as FileSortKey)}
        aria-label={t("Sıralama")}
        style={{ ...alan, flex: "0 0 auto", cursor: "pointer" }}
      >
        {FILE_SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {etiket[key]}
          </option>
        ))}
      </select>
      {children}
    </div>
  );
}
