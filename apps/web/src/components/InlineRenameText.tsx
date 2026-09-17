import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";

interface Props {
  name: string;
  /** Düzenleme açık mı — sağ tık menüsü de açabildiği için kontrol dışarıda. */
  editing: boolean;
  /** Verilmezse ad düzenlenemez (salt okunur ekran, Projelio klasörü). */
  onStart?: () => void;
  /** Değişmeyen ya da boş ad için çağrılmaz; yalnızca kapanır. */
  onCommit: (name: string) => void;
  onClose: () => void;
  style?: CSSProperties;
}

/**
 * Dosya/klasör adı: normalde metin, çift tıklanınca yerinde düzenlenen kutu.
 *
 * Görev adıyla aynı davranış (bkz. TaskColumn renderTitle): Enter ya da
 * dışarı tıklamak kaydeder, Esc vazgeçer. Eskiden tarayıcının `prompt`
 * penceresi açılıyordu — sayfanın geri kalanından kopuk, temasız bir kutu.
 *
 * Çift tık yalnızca ADIN ÜSTÜNDE düzenler; satırın geri kalanına (önizleme,
 * boşluk) çift tık dosyayı açmaya devam eder. Olay bu yüzden burada
 * durduruluyor.
 */
export default function InlineRenameText({ name, editing, onStart, onCommit, onClose, style }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [deger, setDeger] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter kaydedip kutuyu kapatınca blur da tetikleniyor; ikinci kez
  // kaydetmesin diye.
  const bitti = useRef(false);

  useEffect(() => {
    if (!editing) return;
    bitti.current = false;
    setDeger(name);
    // Uzantı seçimin dışında kalır (Drive ve Finder da böyle): kullanıcı çoğu
    // zaman yalnızca adı değiştirmek istiyor, ".pdf"i silip yeniden yazmak değil.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const nokta = name.lastIndexOf(".");
      el.setSelectionRange(0, nokta > 0 ? nokta : name.length);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const bitir = (kaydet: boolean) => {
    if (bitti.current) return;
    bitti.current = true;
    const yeni = deger.trim();
    if (kaydet && yeni && yeni !== name) onCommit(yeni);
    onClose();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={deger}
        aria-label={t("Yeni ad")}
        onChange={(e) => setDeger(e.target.value)}
        onBlur={() => bitir(true)}
        onKeyDown={(e) => {
          // Satırın ve sayfanın kısayolları (seçim, silme) kutudayken çalışmasın.
          e.stopPropagation();
          if (e.key === "Enter") bitir(true);
          else if (e.key === "Escape") bitir(false);
        }}
        // Satır tıklaması seçim/önizleme yapıyor, basılı tutmak kement başlatıyor.
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        // Sürüklenebilir satırın içinde metin seçmek sürükleme başlatmasın.
        draggable
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          ...style,
          width: "100%",
          boxSizing: "border-box",
          padding: "1px 5px",
          border: `1px solid ${c.accent}`,
          borderRadius: 6,
          background: c.surface,
          color: c.textPrimary,
          font: "inherit",
          fontSize: style?.fontSize,
          outline: "none",
        }}
      />
    );
  }

  return (
    <div
      title={onStart ? t("{ad} — adı değiştirmek için çift tıkla", { ad: name }) : name}
      onDoubleClick={
        onStart
          ? (e) => {
              e.stopPropagation();
              onStart();
            }
          : undefined
      }
      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...style }}
    >
      {name}
    </div>
  );
}
