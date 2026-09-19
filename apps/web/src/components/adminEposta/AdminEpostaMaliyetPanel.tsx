import { useEffect, useState } from "react";
import type { EpostaLioIslemi, EpostaMaliyetKalemi, EpostaMaliyetOzeti } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useLocale, useT } from "../../lib/i18n";
import { epostaYonetimi } from "../../api/epostaYonetimi";
import { birimYaz, dugme, kart } from "./stiller";

/**
 * Admin > E-posta maliyeti: Lio'nun e-posta yazarken harcadığı token ve
 * bunun Lio Bakiyesi karşılığı.
 *
 * "Birim", aynı harcama bir kullanıcıdan kesilseydi tutacak bakiye (komisyon
 * dahil) — kullanıcıların harcamasıyla aynı ölçü. Bu harcama KİMSENİN
 * bakiyesinden düşmüyor; işletmenin gideri. "Alıcı başına" sütunu bir sonraki
 * kampanyanın bedelini tahmin etmek için.
 */
const ISLEM_ETIKETI: Record<EpostaLioIslemi, string> = {
  ipucu: "Otomatik ipuçları", // dil:anahtar
  kampanya: "Toplu ve tekil gönderimler", // dil:anahtar
  taslak: "Taslak yazdırma", // dil:anahtar
  onizleme: "Önizleme ve denemeler", // dil:anahtar
};

export default function AdminEpostaMaliyetPanel() {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const [gun, setGun] = useState(30);
  const [ozet, setOzet] = useState<EpostaMaliyetOzeti | null>(null);
  const [hata, setHata] = useState("");

  useEffect(() => {
    setOzet(null);
    epostaYonetimi
      .maliyet(gun)
      .then(setOzet)
      .catch((err) => setHata(err instanceof Error ? err.message : t("Maliyet yüklenemedi.")));
  }, [gun]);

  const sayi = (n: number) => n.toLocaleString(locale === "en" ? "en-US" : "tr-TR");
  const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;

  const hucre: React.CSSProperties = { padding: "7px 10px", fontSize: 13.5, color: c.textPrimary, borderBottom: `1px solid ${c.border}`, whiteSpace: "nowrap" };
  const baslikHucre: React.CSSProperties = { ...hucre, color: c.textSecondary, fontWeight: 500, fontSize: 12.5, textAlign: "left" };
  const sayiHucre: React.CSSProperties = { ...hucre, textAlign: "right" };

  const KalemSatiri = ({ ad, k, basina }: { ad: string; k: EpostaMaliyetKalemi; basina?: number }) => (
    <tr>
      <td style={{ ...hucre, whiteSpace: "normal" }}>{ad}</td>
      <td style={sayiHucre}>{sayi(k.adet)}</td>
      <td style={sayiHucre}>{sayi(k.inputTokens)}</td>
      <td style={sayiHucre}>{sayi(k.outputTokens)}</td>
      <td style={sayiHucre}>{usd(k.maliyetUsd)}</td>
      <td style={{ ...sayiHucre, fontWeight: 600 }}>{birimYaz(k.birim, locale)}</td>
      {basina !== undefined && <td style={sayiHucre}>{birimYaz(basina, locale)}</td>}
    </tr>
  );

  const Tablo = ({ ilkSutun, basina, children }: { ilkSutun: string; basina?: boolean; children: React.ReactNode }) => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={baslikHucre}>{ilkSutun}</th>
            <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Çağrı")}</th>
            <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Giriş token")}</th>
            <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Çıkış token")}</th>
            <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Maliyet")}</th>
            <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Birim")}</th>
            {basina && <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Alıcı başına")}</th>}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
        {t(
          "Lio'nun e-posta yazarken harcadığı token ve bunun Lio Bakiyesi karşılığı (birim, komisyon dahil). Bu harcama kullanıcıların bakiyesinden düşmez; işletmenin gideridir."
        )}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {[7, 30, 90].map((g) => (
          <button key={g} type="button" onClick={() => setGun(g)} style={{ ...dugme(c, gun === g ? "birincil" : "ikincil"), padding: "6px 12px" }}>
            {t("Son {gun} gün", { gun: g })}
          </button>
        ))}
      </div>

      {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}
      {!ozet && !hata && <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</span>}

      {ozet && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            {[
              { etiket: t("Toplam birim"), deger: birimYaz(ozet.toplam.birim, locale) },
              { etiket: t("Sağlayıcı maliyeti"), deger: usd(ozet.toplam.maliyetUsd) },
              { etiket: t("Lio çağrısı"), deger: sayi(ozet.toplam.adet) },
              { etiket: t("Toplam token"), deger: sayi(ozet.toplam.inputTokens + ozet.toplam.outputTokens) },
            ].map((k) => (
              <div key={k.etiket} style={kart(c)}>
                <div style={{ fontSize: 12.5, color: c.textSecondary }}>{k.etiket}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: c.textPrimary, marginTop: 4 }}>{k.deger}</div>
              </div>
            ))}
          </div>

          <section style={kart(c)}>
            <h3 style={{ fontSize: 15, margin: "0 0 10px", color: c.textPrimary }}>{t("İşlem türüne göre")}</h3>
            <Tablo ilkSutun={t("İşlem")}>
              {(Object.keys(ISLEM_ETIKETI) as EpostaLioIslemi[]).map((i) => (
                <KalemSatiri key={i} ad={t(ISLEM_ETIKETI[i])} k={ozet.islemeGore[i]} />
              ))}
            </Tablo>
          </section>

          <section style={kart(c)}>
            <h3 style={{ fontSize: 15, margin: "0 0 10px", color: c.textPrimary }}>{t("Gönderimler")}</h3>
            {ozet.kampanyalar.length === 0 ? (
              <p style={{ fontSize: 13.5, color: c.textSecondary, margin: 0 }}>{t("Bu dönemde Lio ile yazılmış gönderim yok.")}</p>
            ) : (
              <Tablo ilkSutun={t("Konu")} basina>
                {ozet.kampanyalar.map((k) => (
                  <KalemSatiri key={k.kampanyaId} ad={`${k.konu}${k.tur === "tekil" ? ` (${t("tekil")})` : ""}`} k={k} basina={k.birimBasina} />
                ))}
              </Tablo>
            )}
          </section>

          <section style={kart(c)}>
            <h3 style={{ fontSize: 15, margin: "0 0 10px", color: c.textPrimary }}>{t("İpuçları")}</h3>
            {ozet.ipuclari.length === 0 ? (
              <p style={{ fontSize: 13.5, color: c.textSecondary, margin: 0 }}>{t("Bu dönemde Lio ile yazılmış ipucu yok.")}</p>
            ) : (
              <Tablo ilkSutun={t("İpucu")} basina>
                {ozet.ipuclari.map((k) => (
                  <KalemSatiri key={k.anahtar} ad={k.baslik} k={k} basina={k.birimBasina} />
                ))}
              </Tablo>
            )}
          </section>

          <section style={kart(c)}>
            <h3 style={{ fontSize: 15, margin: "0 0 10px", color: c.textPrimary }}>{t("Son işlemler")}</h3>
            {ozet.son.length === 0 ? (
              <p style={{ fontSize: 13.5, color: c.textSecondary, margin: 0 }}>{t("Bu dönemde kayıt yok.")}</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={baslikHucre}>{t("Tarih")}</th>
                      <th style={baslikHucre}>{t("İşlem")}</th>
                      <th style={baslikHucre}>{t("Alıcı / konu")}</th>
                      <th style={baslikHucre}>{t("Model")}</th>
                      <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Token")}</th>
                      <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Birim")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ozet.son.map((s) => (
                      <tr key={s.id} style={{ opacity: s.basarili ? 1 : 0.6 }}>
                        <td style={hucre}>{new Date(s.createdAt).toLocaleString(locale === "en" ? "en-GB" : "tr-TR")}</td>
                        <td style={hucre}>{t(ISLEM_ETIKETI[s.islem])}</td>
                        <td style={{ ...hucre, whiteSpace: "normal" }}>
                          {[s.aliciAdi, s.konu].filter(Boolean).join(" · ") || "—"}
                          {!s.basarili && ` (${t("yanıt kullanılamadı")})`}
                        </td>
                        <td style={hucre}>{s.model}</td>
                        <td style={sayiHucre}>{sayi(s.inputTokens + s.outputTokens)}</td>
                        <td style={{ ...sayiHucre, fontWeight: 600 }}>{birimYaz(s.birim, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
