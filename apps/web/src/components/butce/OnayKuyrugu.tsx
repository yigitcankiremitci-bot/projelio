import { useState } from "react";
import type { GorevButceTalebi } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara, fmtTarih } from "./butceBicim";

interface Props {
  talepler: GorevButceTalebi[];
  /** Karar verildikten sonra sayfayı tazelemek için. */
  onDegisti: () => void;
}

/**
 * Onay bekleyen görev bütçeleri.
 *
 * Bu ekranda kullanıcıdan İŞ İSTEYEN TEK ŞEY bu liste, o yüzden en üstte durur.
 *
 * Akışın tamamı: bir görev için para gerekiyor → talep açılır → buraya düşer →
 * yönetici onaylar ("planlandı": taahhüt, kasadan para çıkmadı) → ödeme
 * yapılınca "ödendi" olur ve deftere gerçek gider satırı düşer.
 *
 * RET BİR SONUÇTUR, sessizce kaybolmaz: reddedilen talep gerekçesiyle durur ve
 * talep eden kişi bildirim alır. Aksi hâlde "onaylandı mı, unutuldu mu"
 * belirsizliği kalırdı.
 */
export default function OnayKuyrugu({ talepler, onDegisti }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [islenen, setIslenen] = useState<string | null>(null);
  const [redEdilen, setRedEdilen] = useState<string | null>(null);
  const [gerekce, setGerekce] = useState("");
  const [hata, setHata] = useState("");

  const karar = async (taskId: string, approve: boolean, note?: string) => {
    setIslenen(taskId);
    setHata("");
    try {
      await api.post(`/budget/tasks/${taskId}/decision`, { approve, note });
      setRedEdilen(null);
      setGerekce("");
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Karar kaydedilemedi."));
    } finally {
      setIslenen(null);
    }
  };

  /** Onaylanmış bütçeyi öder: deftere gerçek bir gider satırı düşer. */
  const ode = async (taskId: string) => {
    setIslenen(taskId);
    setHata("");
    try {
      await api.post(`/budget/tasks/${taskId}/pay`, {});
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Ödeme işlenemedi."));
    } finally {
      setIslenen(null);
    }
  };

  if (talepler.length === 0) return null;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Görev bütçeleri")}</h2>
        <span
          style={{
            fontSize: 11,
            padding: "1px 8px",
            borderRadius: 999,
            background: `${c.warning}22`,
            color: c.accentDark,
          }}
        >
          {talepler.length}
        </span>
      </div>

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: "0 0 8px" }}>{hata}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {talepler.map((talep) => {
          const mesgul = islenen === talep.taskId;
          const nereden = talep.projectTitle || talep.departmentName;
          return (
            <div
              key={talep.taskId}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: c.surface,
                border: `1px solid ${c.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 14, color: c.textPrimary }}>{talep.title}</div>
                  <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                    {[
                      nereden,
                      talep.requestedByName && `${t("İsteyen")}: ${talep.requestedByName}`,
                      talep.requestedAt && fmtTarih(talep.requestedAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary, flexShrink: 0 }}>
                  {fmtPara(talep.amount, talep.currency)}
                </span>
              </div>

              {talep.note && (
                <p style={{ fontSize: 12.5, color: c.textSecondary, margin: "6px 0 0", fontStyle: "italic" }}>
                  “{talep.note}”
                </p>
              )}

              {redEdilen === talep.taskId ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {/* Ret gerekçesi isteniyor ama ZORUNLU DEĞİL: gerekçe
                      yazmayı zorunlu kılmak, yöneticinin kararı ertelemesine
                      yol açıyor ve talep sahibi hiç cevap alamıyor. */}
                  <input
                    value={gerekce}
                    onChange={(e) => setGerekce(e.target.value)}
                    placeholder={t("Ret gerekçesi (isteğe bağlı)")}
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => karar(talep.taskId, false, gerekce)}
                      disabled={mesgul}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 7,
                        border: "none",
                        background: c.danger,
                        color: "#fff",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {t("Reddet")}
                    </button>
                    <button
                      onClick={() => {
                        setRedEdilen(null);
                        setGerekce("");
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 7,
                        border: `1px solid ${c.border}`,
                        background: "transparent",
                        color: c.textSecondary,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {t("Vazgeç")}
                    </button>
                  </div>
                </div>
              ) : talep.status === "planned" ? (
                /* Onaylandı ama henüz ödenmedi. Taahhüt bütçeyi bağlar, kasayı
                   değil — ödeme ayrı bir adım ve deftere gerçek satırı o yazar. */
                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: c.textSecondary, flex: 1 }}>
                    {t("Onaylandı, ödeme bekliyor")}
                    {talep.decidedByName ? ` · ${talep.decidedByName}` : ""}
                  </span>
                  <button
                    onClick={() => ode(talep.taskId)}
                    disabled={mesgul}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 7,
                      border: "none",
                      background: c.primary,
                      color: c.onPrimary,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {t("Ödendi olarak işaretle")}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => karar(talep.taskId, true)}
                    disabled={mesgul}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 7,
                      border: "none",
                      background: c.primary,
                      color: c.onPrimary,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {t("Onayla")}
                  </button>
                  <button
                    onClick={() => {
                      setRedEdilen(talep.taskId);
                      setGerekce("");
                    }}
                    disabled={mesgul}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 7,
                      border: `1px solid ${c.border}`,
                      background: "transparent",
                      color: c.textPrimary,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {t("Reddet")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
