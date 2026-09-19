import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { ornekIsApi } from "../api/ornekIs";

/**
 * Ayarlar > Yardımcılar'daki "Örnek iş" satırının düğmeleri.
 *
 * Örnek iş ilk girişte kendiliğinden açılıyor; bu düğme iki kişi için var:
 * örneği silip sonradan yeniden görmek isteyen ve özellik gelmeden ÖNCE kayıt
 * olmuş olan (onların hesabına sormadan bir şey eklemiyoruz).
 */
export default function OrnekIsAyari() {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [jobId, setJobId] = useState<string | null | undefined>(undefined);
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");

  useEffect(() => {
    ornekIsApi
      .durum()
      .then((d) => setJobId(d.jobId))
      // Uç yoksa (sunucu güncellenmeden) satır "ekle" hâlinde kalır; basınca
      // alınan hata aşağıda yazılır.
      .catch(() => setJobId(null));
  }, []);

  const ekle = async () => {
    setHata("");
    setCalisiyor(true);
    try {
      const sonuc = await ornekIsApi.olustur();
      navigate(`/jobs/${sonuc.jobId}`);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Örnek iş eklenemedi."));
      setCalisiyor(false);
    }
  };

  const dugme = {
    background: c.primary,
    color: c.onPrimary,
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    fontSize: 15,
    fontWeight: 500,
  } as const;

  if (jobId === undefined) return <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      {jobId ? (
        <button type="button" onClick={() => navigate(`/jobs/${jobId}`)} style={dugme}>
          {t("Örnek işi aç")}
        </button>
      ) : (
        <button type="button" onClick={() => void ekle()} disabled={calisiyor} style={dugme}>
          {calisiyor ? t("Hazırlanıyor…") : t("Örnek iş ekle")}
        </button>
      )}
      {hata && <span style={{ fontSize: 13, color: c.danger }}>{hata}</span>}
    </div>
  );
}
