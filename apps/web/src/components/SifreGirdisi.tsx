import { useState, type CSSProperties } from "react";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import { IconEye, IconEyeOff } from "./icons";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Tarayıcının şifre kasası davranışı. "new-password": kendi kasasına
   * kaydetmeye kalkmasın (hesap şifresi Projelio'da duruyor);
   * "current-password": kullanıcının kendi Projelio şifresi.
   */
  autoComplete: "new-password" | "current-password";
  /** Alanın kutusuna uygulanır; düğme kutunun İÇİNDE durur. */
  style?: CSSProperties;
}

/**
 * Göz düğmeli şifre alanı: yazılanı isteyince gösterir.
 *
 * NEDEN: uzun, rastgele bir hesap şifresini yapıştırırken ya da elle
 * yazarken ne girildiğini görmeden kaydetmek, yanlış şifrenin kasaya
 * girmesi demekti — hata ancak biri o hesaba girmeye çalışınca çıkıyordu.
 *
 * Görünürlük BİLEREK kalıcı değil: bileşen her açılışta gizli başlar,
 * açık bırakılmış bir ekran şifreyi sergilemesin.
 */
export default function SifreGirdisi({ value, onChange, placeholder, autoComplete, style }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [gorunur, setGorunur] = useState(false);
  const etiket = gorunur ? t("Şifreyi gizle") : t("Şifreyi göster");

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", ...style, padding: 0 }}>
      <input
        type={gorunur ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        // Görünür hâlde yazım denetimi/otomatik düzeltme şifreyi bozmasın.
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{
          fontSize: style?.fontSize ?? 13,
          padding: (style?.padding as string | number | undefined) ?? "6px 8px",
          paddingRight: 34,
          width: "100%",
        }}
      />
      <button
        type="button"
        onClick={() => setGorunur((v) => !v)}
        aria-label={etiket}
        aria-pressed={gorunur}
        title={etiket}
        style={{
          position: "absolute",
          right: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          padding: 0,
          background: "transparent",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        {gorunur ? <IconEyeOff size={16} color={c.textSecondary} /> : <IconEye size={16} color={c.textSecondary} />}
      </button>
    </div>
  );
}
