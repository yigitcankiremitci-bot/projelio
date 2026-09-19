import type { DemoRandevuGorunumu } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useLocale, useT } from "../../lib/i18n";
import { uzunTarih } from "./demoBicim";

/** Randevunun saati, süresi, sunucusu — yönetim sayfası, başarı ekranı ve Ayarlar kartı. */
export default function OzetKutusu({ randevu }: { randevu: DemoRandevuGorunumu }) {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const iptal = randevu.durum === "iptal";
  return (
    <div style={{ padding: "14px 16px", border: `1px solid ${c.border}`, borderRadius: 12, opacity: iptal ? 0.7 : 1 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary, textDecoration: iptal ? "line-through" : undefined }}>
        {uzunTarih(randevu.baslangic, randevu.bitis, randevu.saatDilimi, locale)}
      </div>
      <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 4 }}>
        {t("40 dakika · Online görüşme")}
        {randevu.sunucuAdi ? ` · ${randevu.sunucuAdi}` : ""}
      </div>
      {!iptal && !randevu.toplantiLinki && (
        <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 6 }}>{t("Görüşme bağlantısı görüşmeden önce e-postayla gönderilecek.")}</div>
      )}
    </div>
  );
}

