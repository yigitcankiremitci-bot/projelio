import type { Locale } from "@projelio/shared";
import { useLocale, useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Giriş/kayıt ekranlarının sağ üstündeki dil seçici.
 *
 * Dil tarayıcıdan tahmin ediliyor (bkz. resolveLocale) ve tahmin yanlış
 * olabilir: Türkçe tarayıcılı bir yabancı, ya da ortak bir bilgisayar. Oturum
 * açmadan önce dili değiştirmenin başka yolu yoktu — Ayarlar içeride.
 *
 * Dil adları KENDİ dillerinde yazılı ve çevrilmez: İngilizce arayüzde
 * "Türkçe" yazmazsa Türkçe arayan kişi onu tanıyamaz.
 */
const DILLER: { value: Locale; ad: string }[] = [
  { value: "tr", ad: "Türkçe" }, // dil:atla — dil adı kendi dilinde kalır
  { value: "en", ad: "English" },
];

export default function GirisDilSecici() {
  const c = useThemeColors();
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label={t("Dil")}
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 10,
        display: "flex",
        gap: 2,
        padding: 3,
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      {DILLER.map((dil) => {
        const aktif = locale === dil.value;
        return (
          <button
            key={dil.value}
            type="button"
            lang={dil.value}
            aria-pressed={aktif}
            onClick={() => setLocale(dil.value)}
            style={{
              fontSize: 13,
              fontWeight: aktif ? 600 : 400,
              padding: "5px 10px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              background: aktif ? c.primary : "transparent",
              color: aktif ? c.onPrimary : c.textSecondary,
            }}
          >
            {dil.ad}
          </button>
        );
      })}
    </div>
  );
}
