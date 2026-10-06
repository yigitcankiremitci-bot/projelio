import { useState } from "react";
import type { SocialAnalyticsAccount, SocialIdea, SocialIdeaReport } from "@projelio/shared";
import { socialMediaApi, type SocialScope } from "../../api/socialMedia";
import { parseServerDate } from "../../lib/dates";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { IconSparkle } from "../icons";
import { BolumBasligi, useBolumRenkleri } from "./gezinme";
import { useAnalizStilleri } from "./ortak";

interface Props {
  scope: SocialScope;
  hesaplar: SocialAnalyticsAccount[];
  raporlar: SocialIdeaReport[];
  /** Kıyaslanabilir gönderi ve ilham sayısı — veri azken kullanıcı uyarılır. */
  gonderiSayisi: number;
  ilhamSayisi: number;
  canWrite: boolean;
  onYeniRapor: (rapor: SocialIdeaReport) => void;
  /** Fikir takvime "fikir" durumunda bir içerik olarak eklendi — takvim tazelensin. */
  onIcerikEklendi: () => void;
}

/**
 * Lio'nun fikir raporları: veriden çıkan kalıplar + somut içerik fikirleri.
 *
 * Rapor sunucuda SAKLANIR (bakiye harcıyor); son beşi listelenir. Her fikir
 * tek tıkla takvime "fikir" durumunda bir içerik olarak eklenebiliyor: rapor
 * okunup unutulmasın, içerik akışına girsin.
 */
export default function FikirRaporlari({
  scope,
  hesaplar,
  raporlar,
  gonderiSayisi,
  ilhamSayisi,
  canWrite,
  onYeniRapor,
  onIcerikEklendi,
}: Props) {
  const t = useT();
  const { c, kart, alan, birincilDugme, ikincilDugme } = useAnalizStilleri();
  const renk = useBolumRenkleri().fikirler;
  const [hesap, setHesap] = useState("");
  const [istek, setIstek] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const [acikRapor, setAcikRapor] = useState<string | null>(raporlar[0]?.id ?? null);
  const [eklenen, setEklenen] = useState<Set<string>>(new Set());

  const uret = async () => {
    setCalisiyor(true);
    setHata("");
    try {
      const rapor = await socialMediaApi.fikirUret(scope, {
        accountId: hesap || undefined,
        istek: istek.trim() || undefined,
      });
      onYeniRapor(rapor);
      setAcikRapor(rapor.id);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Lio bir rapor üretemedi, tekrar dene."));
    } finally {
      setCalisiyor(false);
    }
  };

  const takvimeEkle = async (rapor: SocialIdeaReport, fikir: SocialIdea, anahtar: string) => {
    try {
      await socialMediaApi.createPost(scope, {
        title: fikir.baslik.slice(0, 200),
        caption: [fikir.hook, fikir.format && `${t("Format")}: ${fikir.format}`, fikir.neden && `${t("Neden")}: ${fikir.neden}`]
          .filter(Boolean)
          .join("\n\n"),
        status: "idea",
        contentType: /reels|video/i.test(fikir.format) ? "reel" : /karusel|carousel/i.test(fikir.format) ? "carousel" : undefined,
        accountIds: rapor.accountId ? [rapor.accountId] : undefined,
      });
      setEklenen((s) => new Set(s).add(anahtar));
      onIcerikEklendi();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İçerik kaydedilemedi"));
    }
  };

  const azVeri = gonderiSayisi < 6 && ilhamSayisi < 3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {canWrite && (
        <div style={{ ...kart, display: "flex", flexDirection: "column", gap: 10, background: `${renk}0D`, borderColor: `${renk}40` }}>
          <BolumBasligi
            ikon={<IconSparkle size={15} />}
            renk={renk}
            baslik={t("Lio'dan fikir al")}
            aciklama={t(
              "Lio en iyi ve en zayıf gönderilerine, önceki analizlerine ve ilham panona bakar; neyin işlediğini çıkarıp yeni içerik fikirleri önerir."
            )}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {hesaplar.length > 1 && (
              <select value={hesap} onChange={(e) => setHesap(e.target.value)} style={{ ...alan, width: "auto", flex: "0 0 auto" }}>
                <option value="">{t("Tüm hesaplar")}</option>
                {hesaplar.map((h) => (
                  <option key={h.accountId} value={h.accountId}>
                    @{h.handle}
                  </option>
                ))}
              </select>
            )}
            <input
              value={istek}
              onChange={(e) => setIstek(e.target.value)}
              placeholder={t("Odak (isteğe bağlı) — ör. bu ay eğitici içerik, 30 sn altı reels")}
              style={{ ...alan, flex: "1 1 260px", width: "auto" }}
            />
            <button
              type="button"
              onClick={() => void uret()}
              disabled={calisiyor}
              style={{
                ...birincilDugme,
                background: renk,
                opacity: calisiyor ? 0.6 : 1,
                cursor: calisiyor ? "default" : "pointer",
              }}
            >
              {calisiyor ? t("Lio düşünüyor…") : `✦ ${t("Fikir üret")}`}
            </button>
          </div>
          <span style={{ fontSize: 11, color: c.textSecondary }}>
            {azVeri
              ? t("Veri az: önce gönderilerini çek ve ilham panosuna birkaç kaynak ekle, fikirler daha isabetli olur.")
              : t("Lio Bakiyesi harcar. Raporlar saklanır, tekrar açmak ücretsiz.")}
          </span>
          {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
        </div>
      )}

      {raporlar.length === 0 && (
        <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Henüz fikir raporu yok.")}</span>
      )}

      {raporlar.map((rapor) => {
        const acik = acikRapor === rapor.id;
        return (
          <div key={rapor.id} style={{ ...kart, display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => setAcikRapor(acik ? null : rapor.id)}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
                color: c.textPrimary,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {parseServerDate(rapor.createdAt).toLocaleString(bicimDili(), {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span style={{ fontSize: 12, color: c.textSecondary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rapor.istek ? `· ${rapor.istek}` : ""}
                {rapor.createdByName ? ` · ${rapor.createdByName}` : ""}
              </span>
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {t("{n} fikir", { n: rapor.fikirler.length })} {acik ? "▴" : "▾"}
              </span>
            </button>

            {acik && (
              <>
                {rapor.ozet && <p style={{ margin: 0, fontSize: 13, color: c.textPrimary, lineHeight: 1.6 }}>{rapor.ozet}</p>}
                {rapor.kaliplar.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>{t("Verideki kalıplar")}</span>
                    {rapor.kaliplar.map((k, i) => (
                      <div key={i} style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>
                        <b>{k.baslik}</b>
                        {k.aciklama && <span style={{ color: c.textSecondary }}> — {k.aciklama}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
                  {rapor.fikirler.map((f, i) => {
                    const anahtar = `${rapor.id}:${i}`;
                    return (
                      <div
                        key={anahtar}
                        style={{
                          border: `1px solid ${c.border}`,
                          borderRadius: 8,
                          padding: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          background: c.background,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, flex: 1 }}>{f.baslik}</span>
                          {f.format && (
                            <span style={{ fontSize: 11, color: c.primary, whiteSpace: "nowrap" }}>{f.format}</span>
                          )}
                        </div>
                        {f.hook && (
                          <span style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>
                            <span style={{ color: c.accent }}>❝</span> {f.hook}
                          </span>
                        )}
                        {f.neden && <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>{f.neden}</span>}
                        {canWrite && (
                          <button
                            type="button"
                            disabled={eklenen.has(anahtar)}
                            onClick={() => void takvimeEkle(rapor, f, anahtar)}
                            style={{
                              ...ikincilDugme,
                              alignSelf: "flex-start",
                              marginTop: "auto",
                              color: eklenen.has(anahtar) ? c.success : c.primary,
                              cursor: eklenen.has(anahtar) ? "default" : "pointer",
                            }}
                          >
                            {eklenen.has(anahtar) ? `✓ ${t("Fikirlere eklendi")}` : `+ ${t("İçerik fikri olarak ekle")}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontSize: 11, color: c.textSecondary }}>{t("{birim} birim", { birim: rapor.kredi })}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
