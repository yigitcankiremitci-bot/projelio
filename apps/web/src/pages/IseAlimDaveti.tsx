import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { DepartmentMemberRole, IseAlimDaveti as Davet } from "@projelio/shared";
import { iseAlimApi } from "../api/iseAlim";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useT } from "../lib/i18n";
import { departmanAdi } from "../lib/departmanAdi";
import { useIsDesktop } from "../lib/useIsDesktop";
import { pageGutter } from "../lib/layout";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { useThemeColors } from "../theme/useThemeColors";
import { ROL_ETIKETI } from "../components/ekipHesaplari/KadroSecimi";

/**
 * İşe alım davetinin açıldığı sayfa (bildirimdeki bağlantı: /ise-alim/:id).
 *
 * Kişi kabul edene kadar şirkette hiçbir şey göremez; burada neye "evet"
 * dediğini tam olarak görür: pozisyon, iş tanımı, departmanlar (rolüyle) ve
 * modüller. Kabulden sonra şirket kenar çubuğunda belirir ve sayfasına gidilir.
 *
 * Daveti gönderen ya da şirket sahibi de bu adresi açabilir; onlara yanıt
 * düğmeleri gösterilmez.
 */
export default function IseAlimDaveti() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = useThemeColors();
  const t = useT();
  const { user } = useCurrentUser();
  const gutter = pageGutter(useIsDesktop());
  const [davet, setDavet] = useState<Davet | null>(null);
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState<"kabul" | "ret" | null>(null);

  useEffect(() => {
    if (!id) return;
    iseAlimApi
      .detay(id)
      .then(setDavet)
      .catch((err) => setHata(err instanceof Error ? err.message : t("Davet bulunamadı")));
  }, [id]);

  const yanitla = async (kabul: boolean) => {
    if (!davet) return;
    setBusy(kabul ? "kabul" : "ret");
    setHata("");
    try {
      const guncel = await iseAlimApi.yanitla(davet.id, kabul);
      setDavet(guncel);
      if (kabul) {
        notifySidebarChanged();
        navigate(`/organizations/${guncel.organizationId}`);
      }
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Yanıt gönderilemedi"));
    } finally {
      setBusy(null);
    }
  };

  const kart = {
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    padding: 16,
    background: c.surface,
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  };
  const baslik = { fontSize: 12, fontWeight: 600, color: c.textSecondary, letterSpacing: 0.3 };
  const benim = davet && user?.id === davet.userId;

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: `32px ${gutter}px` }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {!davet ? (
          <p style={{ fontSize: 14, color: hata ? c.danger : c.textSecondary }}>{hata || t("Yükleniyor…")}</p>
        ) : (
          <>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>
                {t("{sirket} seni ekibine davet ediyor", { sirket: davet.organizationName })}
              </h1>
              {davet.invitedByName && (
                <p style={{ fontSize: 13, color: c.textSecondary, margin: "6px 0 0" }}>
                  {t("Daveti gönderen: {kisi}", { kisi: davet.invitedByName })}
                </p>
              )}
            </div>

            {(davet.pozisyon || davet.isTanimi) && (
              <div style={kart}>
                <span style={baslik}>{t("Pozisyon ve iş tanımı")}</span>
                {davet.pozisyon && <span style={{ fontSize: 15, color: c.textPrimary }}>{davet.pozisyon}</span>}
                {davet.isTanimi && (
                  <p style={{ fontSize: 13, color: c.textPrimary, margin: 0, whiteSpace: "pre-wrap" }}>{davet.isTanimi}</p>
                )}
              </div>
            )}

            <div style={kart}>
              <span style={baslik}>{t("Departmanlar")}</span>
              {davet.departmanlar.map((d) => (
                <div key={d.id} style={{ fontSize: 14, color: c.textPrimary }}>
                  {departmanAdi(d.name, t)}
                  <span style={{ color: c.textSecondary }}> · {t(ROL_ETIKETI[d.role as DepartmentMemberRole])}</span>
                </div>
              ))}
              {davet.moduller.length > 0 && (
                <>
                  <span style={{ ...baslik, marginTop: 8 }}>{t("Kayıt girebileceğin modüller")}</span>
                  <span style={{ fontSize: 13, color: c.textPrimary }}>{davet.moduller.map((m) => m.name).join(", ")}</span>
                </>
              )}
              <span style={{ fontSize: 11, color: c.textSecondary, marginTop: 6 }}>
                {t("Departmanın kadrosunda olmak o departmanın modüllerini görmeye yeter. İşaretlediğin modüllerde kayıt da girebilir.")}
              </span>
            </div>

            {hata && <span style={{ fontSize: 13, color: c.danger }}>{hata}</span>}

            {davet.status === "pending" ? (
              benim ? (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => void yanitla(false)}
                    disabled={busy !== null}
                    style={{
                      fontSize: 14,
                      padding: "8px 16px",
                      background: "transparent",
                      border: `1px solid ${c.border}`,
                      borderRadius: 8,
                      color: c.textSecondary,
                      cursor: "pointer",
                    }}
                  >
                    {busy === "ret" ? t("Gönderiliyor…") : t("Reddet")}
                  </button>
                  <button
                    data-primary
                    onClick={() => void yanitla(true)}
                    disabled={busy !== null}
                    style={{
                      fontSize: 14,
                      padding: "8px 16px",
                      background: c.primary,
                      color: c.onPrimary,
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {busy === "kabul" ? t("Katılıyorsun…") : t("Kabul et ve katıl")}
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: c.textSecondary }}>{t("{kisi} henüz yanıt vermedi.", { kisi: davet.fullName })}</span>
              )
            ) : (
              <span style={{ fontSize: 13, color: c.textSecondary }}>
                {davet.status === "accepted"
                  ? t("Bu davet kabul edildi.")
                  : davet.status === "rejected"
                    ? t("Bu davet reddedildi.")
                    : t("Bu davet geri çekildi.")}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
