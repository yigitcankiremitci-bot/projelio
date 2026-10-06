import { useEffect, useState } from "react";
import type { PerformansSonucu, SocialAccountMediaItem, SocialMediaHistory } from "@projelio/shared";
import { buyumeEgrisi, icerikTuru, kaydetPaylasOrani, safeExternalUrl } from "@projelio/shared";
import { socialMediaApi } from "../../api/socialMedia";
import { parseServerDate } from "../../lib/dates";
import { useT } from "../../lib/i18n";
import { bicimDili, yuzde } from "../../lib/i18n/depo";
import Modal from "../Modal";
import { CizgiGrafik } from "./grafikler";
import { useBolumRenkleri } from "./gezinme";
import { kisaSayi, MaddeListesi, PerformansRozeti, sureYazisi, turAdi, useAnalizStilleri } from "./ortak";

interface Props {
  gonderi: SocialAccountMediaItem;
  performans?: PerformansSonucu;
  handle?: string;
  canWrite: boolean;
  onClose: () => void;
  /** Lio analizi bitince güncel satır üst bileşene gider (liste yeniden çekilmesin). */
  onGuncellendi: (gonderi: SocialAccountMediaItem) => void;
}

/**
 * Tek gönderinin metrikleri + Lio'nun "neden böyle gitti" analizi.
 *
 * Analiz KAYDEDİLİR (sunucuda `lio_analiz`): bakiye harcıyor, pencereyi kapatıp
 * açan kullanıcı aynı analizi ikinci kez ödememeli. "Yeniden analiz et" ancak
 * kullanıcı isterse.
 */
export default function GonderiAnalizModal({ gonderi, performans, handle, canWrite, onClose, onGuncellendi }: Props) {
  const t = useT();
  const { c, kart, ikincilDugme, birincilDugme } = useAnalizStilleri();
  const bolumRengi = useBolumRenkleri().gonderiler;
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const [kapakYok, setKapakYok] = useState(false);
  const [gecmis, setGecmis] = useState<SocialMediaHistory | null>(null);

  useEffect(() => {
    let iptal = false;
    socialMediaApi
      .medyaGecmisi(gonderi.id)
      .then((g) => !iptal && setGecmis(g))
      .catch(() => undefined);
    return () => {
      iptal = true;
    };
  }, [gonderi.id]);

  const tur = icerikTuru(gonderi);
  const oran = kaydetPaylasOrani(gonderi);
  const izleme = sureYazisi(gonderi.avgWatchTimeMs);
  const link = safeExternalUrl(gonderi.permalink);
  const analiz = gonderi.lioAnaliz;

  const analizEt = async () => {
    setCalisiyor(true);
    setHata("");
    try {
      onGuncellendi(await socialMediaApi.gonderiAnalizi(gonderi.id));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Lio bir analiz üretemedi, tekrar dene."));
    } finally {
      setCalisiyor(false);
    }
  };

  const metrikler: { ad: string; deger: string }[] = [
    { ad: t("İzlenme"), deger: kisaSayi(gonderi.views) },
    { ad: t("Erişim"), deger: kisaSayi(gonderi.reach) },
    { ad: t("Beğeni"), deger: kisaSayi(gonderi.likeCount) },
    { ad: t("Yorum"), deger: kisaSayi(gonderi.commentsCount) },
    { ad: t("Kaydetme"), deger: kisaSayi(gonderi.saved) },
    { ad: t("Paylaşım"), deger: kisaSayi(gonderi.shares) },
  ];
  if (izleme) metrikler.push({ ad: t("Ort. izlenme süresi"), deger: izleme });
  if (oran !== null) {
    metrikler.push({
      ad: t("Kaydetme + paylaşım oranı"),
      deger: yuzde((oran * 100).toLocaleString(bicimDili(), { maximumFractionDigits: 1 })),
    });
  }

  return (
    <Modal
      title={t("Gönderi analizi")}
      subtitle={handle ? `@${handle}` : undefined}
      onClose={onClose}
      maxWidth={640}
      mobileFullScreen
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          {gonderi.thumbnailUrl && !kapakYok && (
            <img
              src={gonderi.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setKapakYok(true)}
              style={{ width: 120, height: 150, objectFit: "cover", borderRadius: 8, background: c.background }}
            />
          )}
          <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {turAdi(tur, t)}
                {gonderi.postedAt &&
                  ` · ${parseServerDate(gonderi.postedAt).toLocaleString(bicimDili(), {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`}
              </span>
              <PerformansRozeti etiket={performans?.etiket} kat={performans?.kat} t={t} />
            </div>
            {gonderi.caption && (
              <div
                style={{
                  fontSize: 13,
                  color: c.textPrimary,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  maxHeight: 140,
                  overflowY: "auto",
                }}
              >
                {gonderi.caption}
              </div>
            )}
            {link && (
              <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: c.primary }}>
                {t("Instagram'da aç")} ↗
              </a>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
          {metrikler.map((m) => (
            <div key={m.ad} style={{ ...kart, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, color: c.textSecondary }}>{m.ad}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{m.deger}</span>
            </div>
          ))}
        </div>
        <CizgiGrafik
          renk={bolumRengi}
          baslik={t("Büyüme eğrisi")}
          altBaslik={t("Paylaşımdan bu yana izlenme (yeni gönderiler ilk 72 saat saatte bir okunur)")}
          noktalar={buyumeEgrisi(gecmis?.postedAt ?? gonderi.postedAt, gecmis?.noktalar ?? []).map((n) => ({
            x: n.saat,
            y: n.deger,
            xYazi: n.saat < 72 ? t("{n}. saat", { n: Math.round(n.saat) }) : t("{n}. gün", { n: Math.round(n.saat / 24) }),
          }))}
          yBicim={kisaSayi}
          xEtiket={(n) => (n.x < 72 ? t("{n} sa", { n: Math.round(n.x) }) : t("{n} g", { n: Math.round(n.x / 24) }))}
          yukseklik={160}
          bos={t("Bu gönderinin geçmişi henüz yok; her okumada bir nokta eklenir.")}
        />

        {gonderi.metricsError && (
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            {t("Bu gönderinin metrikleri okunamadı:")} {gonderi.metricsError}
          </span>
        )}

        <div style={{ ...kart, display: "flex", flexDirection: "column", gap: 10, background: `${c.primary}08` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{t("Lio: neden böyle gitti?")}</span>
            {canWrite && (
              <button
                type="button"
                onClick={() => void analizEt()}
                disabled={calisiyor}
                style={{
                  ...(analiz ? ikincilDugme : birincilDugme),
                  marginLeft: "auto",
                  opacity: calisiyor ? 0.6 : 1,
                  cursor: calisiyor ? "default" : "pointer",
                }}
              >
                {calisiyor
                  ? tur === "reels" || tur === "video"
                    ? t("Lio videoyu izliyor…")
                    : t("Lio bakıyor…")
                  : analiz
                    ? t("Yeniden analiz et")
                    : t("Analiz et")}
              </button>
            )}
          </div>
          {!analiz && !calisiyor && (
            <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>
              {t(
                "Lio gönderiye bakar (videoysa karelerini ve konuşmasını), metrikleri hesabının normaliyle kıyaslar ve sonraki içerikler için ne yapman gerektiğini söyler. Lio Bakiyesi harcar."
              )}
            </span>
          )}
          {calisiyor && (tur === "reels" || tur === "video") && (
            <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Uzun videolarda bir iki dakika sürebilir.")}</span>
          )}
          {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
          {analiz && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {analiz.gorulen && (
                <span style={{ fontSize: 12, color: c.textSecondary, fontStyle: "italic" }}>
                  {t("Lio'nun gördüğü:")} {analiz.gorulen}
                </span>
              )}
              {analiz.hook && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>{t("Açılış (hook)")}</span>
                  <span style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>{analiz.hook}</span>
                </div>
              )}
              <MaddeListesi baslik={t("Neden böyle gitti")} maddeler={analiz.nedenler} />
              <MaddeListesi baslik={t("Sürdür")} maddeler={analiz.tekrarla} renk={c.success} />
              <MaddeListesi baslik={t("Geliştir")} maddeler={analiz.gelistir} renk={c.accent} />
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                {t("{birim} birim", { birim: analiz.kredi })}
                {gonderi.lioAnalizAt &&
                  ` · ${parseServerDate(gonderi.lioAnalizAt).toLocaleDateString(bicimDili(), { day: "numeric", month: "short" })}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
