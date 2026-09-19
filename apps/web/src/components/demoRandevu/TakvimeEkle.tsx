import { googleTakvimUrl, type DemoRandevuGorunumu } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { demoRandevuApi } from "../../api/demoRandevu";

/**
 * "Google Takvim'e ekle" + "Apple Takvim'e ekle".
 *
 * Apple (ve Outlook) için sunucunun .ics dosyası açılıyor: 1 gün ve 1 saat
 * önce iki hatırlatma o dosyada. Google'ın etkinlik bağlantısı hatırlatma
 * parametresi almıyor — orada kullanıcının varsayılan bildirimi geçerli; iki
 * hatırlatmayı Google'da da isteyen .ics'i içe aktarabilir (e-postada ekli).
 */
export default function TakvimeEkle({ randevu }: { randevu: DemoRandevuGorunumu }) {
  const c = useThemeColors();
  const t = useT();
  const yonetim = `${window.location.origin}/demo-randevu/${randevu.yonetimToken}`;
  const google = googleTakvimUrl({
    baslangic: randevu.baslangic,
    bitis: randevu.bitis,
    baslik: t("Projelio canlı demo"),
    aciklama: [
      t("Projelio ekibiyle 40 dakikalık canlı tanıtım görüşmesi."),
      randevu.toplantiLinki
        ? `${t("Görüşme bağlantısı")}: ${randevu.toplantiLinki}`
        : t("Görüşme bağlantısı görüşmeden önce e-postayla gönderilecek."),
      `${t("Randevuyu yönet")}: ${yonetim}`,
    ].join("\n"),
    konum: randevu.toplantiLinki,
  });
  const dugme = {
    display: "inline-flex",
    alignItems: "center",
    padding: "9px 14px",
    borderRadius: 9,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: 500,
    textDecoration: "none",
  } as const;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <a href={google} target="_blank" rel="noopener noreferrer" style={dugme}>
        {t("Google Takvim'e ekle")}
      </a>
      <a href={demoRandevuApi.icsUrl(randevu.yonetimToken)} style={dugme}>
        {t("Apple Takvim'e ekle")}
      </a>
    </div>
  );
}
