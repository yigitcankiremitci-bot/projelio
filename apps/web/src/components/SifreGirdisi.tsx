import { useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import { IconEye, IconEyeOff } from "./icons";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /**
   * Tarayıcının şifre kasası davranışı. "new-password": yeni şifre (ya da
   * kasaya kaydedilmemesi gereken bir hesap şifresi); "current-password":
   * kullanıcının kendi Projelio şifresi.
   */
  autoComplete: "new-password" | "current-password";
  /** Alanın KENDİSİNE uygulanır — sayfadaki diğer alanlarla aynı görünsün diye. */
  style?: CSSProperties;
  /** Alanı ve düğmeyi saran kutuya: yerleşim için (flex, genişlik). */
  kutuStili?: CSSProperties;
};

/**
 * Göz düğmeli şifre alanı: yazılanı isteyince gösterir. Uygulamadaki BÜTÜN
 * şifre alanları bundan geçer — giriş, kayıt, sıfırlama, Ayarlar, Hesaplar.
 *
 * NEDEN: şifreyi görmeden yazmak, özellikle telefonda, yanlış yazılmış
 * şifreyle giriş denemesi ya da yanlış şifrenin kaydedilmesi demekti. Göz
 * düğmesi önce yalnızca Hesaplar'da vardı; Play kapalı testinin raporu giriş
 * ekranında olmamasını ayrıca yazdı.
 *
 * Görünürlük BİLEREK kalıcı değil: bileşen her açılışta gizli başlar,
 * açık bırakılmış bir ekran şifreyi sergilemesin.
 */
export default function SifreGirdisi({ value, onChange, style, kutuStili, ...girdi }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [gorunur, setGorunur] = useState(false);
  const etiket = gorunur ? t("Şifreyi gizle") : t("Şifreyi göster");

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", ...kutuStili }}>
      <input
        {...girdi}
        type={gorunur ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Görünür hâlde yazım denetimi/otomatik düzeltme şifreyi bozmasın.
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ width: "100%", ...style, paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setGorunur((v) => !v)}
        aria-label={etiket}
        aria-pressed={gorunur}
        title={etiket}
        // Alan devre dışıyken düğme de: gösterilecek bir şey yok.
        disabled={girdi.disabled}
        style={{
          position: "absolute",
          right: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Parmakla dokunulabilecek büyüklükte (telefon).
          width: 34,
          height: 34,
          padding: 0,
          background: "transparent",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        {gorunur ? <IconEyeOff size={18} color={c.textSecondary} /> : <IconEye size={18} color={c.textSecondary} />}
      </button>
    </div>
  );
}
