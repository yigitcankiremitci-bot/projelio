import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { rehberMaddeleri, type RehberMaddesi } from "../../lib/baslangicRehberi";
import { ornekIsApi } from "../../api/ornekIs";
import { IconChevronRight } from "../icons";

/**
 * "?" menüsündeki başlangıç rehberi — maddeler açılır kapanır, her biri kısa
 * bir açıklama ve varsa tek bir eylem ("Örnek işi aç") taşır. İçerik ve
 * kendiliğinden açılma kuralı lib/baslangicRehberi.ts'te.
 */
export default function BaslangicRehberi({
  onEylem,
  turuBaslat,
}: {
  /** Bir eylem çalıştığında menü kapansın diye. */
  onEylem: () => void;
  turuBaslat: (turId: string) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [acik, setAcik] = useState<string | null>("ornek-is");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const maddeler = rehberMaddeleri(user?.accountType);

  const calistir = async (m: RehberMaddesi) => {
    if (!m.eylem) return;
    setHata("");
    if (m.eylem.tur === "yol") {
      navigate(m.eylem.yol);
      onEylem();
    } else if (m.eylem.tur === "sesli-tur") {
      onEylem();
      turuBaslat(m.eylem.turId);
    } else {
      // Örnek iş yoksa (silinmiş ya da özellikten önce kayıt olunmuş) açılıyor;
      // uç zaten idempotent.
      setCalisiyor(true);
      try {
        const { jobId } = await ornekIsApi.olustur();
        navigate(`/jobs/${jobId}`);
        onEylem();
      } catch (err) {
        setHata(err instanceof Error ? err.message : t("Örnek iş açılamadı."));
      } finally {
        setCalisiyor(false);
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {maddeler.map((m) => {
        const buAcik = acik === m.id;
        return (
          <div key={m.id} style={{ borderRadius: 10, background: buAcik ? c.background : "transparent" }}>
            <button
              type="button"
              onClick={() => setAcik(buAcik ? null : m.id)}
              aria-expanded={buAcik}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                padding: "9px 10px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <span style={{ transform: buAcik ? "rotate(90deg)" : "none", transition: "transform .15s", lineHeight: 0 }}>
                <IconChevronRight size={13} color={c.textSecondary} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary }}>{t(m.baslik)}</span>
            </button>
            {buAcik && (
              <div style={{ padding: "0 12px 12px 31px" }}>
                <p style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.5, margin: 0 }}>{t(m.metin)}</p>
                {m.eylem && (
                  <button
                    type="button"
                    disabled={calisiyor}
                    onClick={() => void calistir(m)}
                    style={{
                      marginTop: 8,
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: c.primary,
                      color: c.onPrimary,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {calisiyor && m.eylem.tur === "ornek-is" ? t("Hazırlanıyor…") : t(m.eylem.etiket)}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {hata && <p style={{ fontSize: 12.5, color: c.danger, margin: "4px 10px" }}>{hata}</p>}
    </div>
  );
}
