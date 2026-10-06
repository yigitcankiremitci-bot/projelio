import { useState } from "react";
import type {
  SocialAnalyticsAccount,
  SocialDiscovery,
  SocialDiscoveryCandidate,
  SocialInspiration,
} from "@projelio/shared";
import { safeExternalUrl } from "@projelio/shared";
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
  kesifler: SocialDiscovery[];
  /** Bu kurulumda web araması yapabilen sağlayıcı var mı. */
  acik: boolean;
  canWrite: boolean;
  /** Panoda zaten olan kullanıcı adları — aday kartında "eklendi" görünsün. */
  panodakiler: Set<string>;
  onYeniKesif: (kesif: SocialDiscovery) => void;
  onIlhamEklendi: (ilham: SocialInspiration) => void;
}

/** Instagram profil adresi; diğer platformlar için bilinen kalıplar. */
function profilAdresi(a: SocialDiscoveryCandidate): string {
  switch (a.platform) {
    case "tiktok":
      return `https://www.tiktok.com/@${a.handle}`;
    case "youtube":
      return `https://www.youtube.com/@${a.handle}`;
    case "x":
      return `https://x.com/${a.handle}`;
    case "threads":
      return `https://www.threads.net/@${a.handle}`;
    default:
      return `https://www.instagram.com/${a.handle}/`;
  }
}

/**
 * "Benzer hesap bul": Lio nişini çıkarır ve AÇIK WEB'de (listeler, haberler,
 * bloglar) bu nişteki içerik üreticilerini arar. Instagram taranmaz.
 *
 * Aday "doğrulandı" değilse kaynağı bu aramada görülmemiştir — model kendi
 * bilgisinden yazmış olabilir. Kart bunu açıkça söyler; kullanıcı profili
 * açıp bakmadan panoya eklememeli.
 */
export default function BenzerHesapKesfi({
  scope,
  hesaplar,
  kesifler,
  acik,
  canWrite,
  panodakiler,
  onYeniKesif,
  onIlhamEklendi,
}: Props) {
  const t = useT();
  const { c, kart, alan, birincilDugme, ikincilDugme } = useAnalizStilleri();
  const renk = useBolumRenkleri().ilham;
  const [hesap, setHesap] = useState("");
  const [istek, setIstek] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const [acikKesif, setAcikKesif] = useState<string | null>(kesifler[0]?.id ?? null);
  const [ekleniyor, setEkleniyor] = useState<string | null>(null);

  const bul = async () => {
    setCalisiyor(true);
    setHata("");
    try {
      const kesif = await socialMediaApi.benzerHesapBul(scope, {
        accountId: hesap || undefined,
        istek: istek.trim() || undefined,
      });
      onYeniKesif(kesif);
      setAcikKesif(kesif.id);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Lio bir sonuç üretemedi, tekrar dene."));
    } finally {
      setCalisiyor(false);
    }
  };

  const panoyaEkle = async (a: SocialDiscoveryCandidate) => {
    setEkleniyor(a.handle);
    setHata("");
    try {
      const not = [a.neden, a.kaynak ? `${t("Kaynak")}: ${a.kaynak}` : ""].filter(Boolean).join("\n\n");
      onIlhamEklendi(
        await socialMediaApi.ilhamEkle(scope, {
          kind: "account",
          platform: a.platform,
          handle: a.handle,
          title: a.ad ? `${a.ad} (@${a.handle})` : `@${a.handle}`,
          url: profilAdresi(a),
          note: not,
          tags: t("benzer hesap"),
        })
      );
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setEkleniyor(null);
    }
  };

  if (!acik && kesifler.length === 0) return null;

  return (
    <div style={{ ...kart, display: "flex", flexDirection: "column", gap: 10, background: `${renk}0D`, borderColor: `${renk}40` }}>
      <BolumBasligi
        ikon={<IconSparkle size={15} />}
        renk={renk}
        baslik={t("Benzer hesap bul")}
        aciklama={t(
          "Lio gönderilerinden nişini çıkarır ve açık web'de (listeler, haberler, bloglar) bu nişteki içerik üreticilerini arar. Instagram taranmaz; adayları profiline bakıp panoya ekleyen sensin."
        )}
      />

      {acik && canWrite && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hesaplar.length > 1 && (
            <select value={hesap} onChange={(e) => setHesap(e.target.value)} style={{ ...alan, width: "auto" }}>
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
            placeholder={t("Ne arıyorsun? (isteğe bağlı) — ör. Türkiye'deki küçük müzik prodüktörleri, eğitici reels")}
            style={{ ...alan, flex: "1 1 260px", width: "auto" }}
          />
          <button
            type="button"
            onClick={() => void bul()}
            disabled={calisiyor}
            style={{ ...birincilDugme, opacity: calisiyor ? 0.6 : 1, cursor: calisiyor ? "default" : "pointer" }}
          >
            {calisiyor ? t("Lio web'de arıyor…") : t("Hesap bul")}
          </button>
        </div>
      )}
      {calisiyor && (
        <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Birkaç arama yapıyor; bir iki dakika sürebilir.")}</span>
      )}
      {acik && canWrite && !calisiyor && (
        <span style={{ fontSize: 11, color: c.textSecondary }}>
          {t("Lio Bakiyesi harcar (model + en fazla 3 web araması). Sonuçlar saklanır.")}
        </span>
      )}
      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}

      {kesifler.map((k) => {
        const acikMi = acikKesif === k.id;
        return (
          <div key={k.id} style={{ borderTop: `1px solid ${c.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              onClick={() => setAcikKesif(acikMi ? null : k.id)}
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
                {parseServerDate(k.createdAt).toLocaleString(bicimDili(), {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: c.textSecondary,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {k.istek ? `· ${k.istek}` : ""}
              </span>
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {t("{n} aday", { n: k.adaylar.length })} {acikMi ? "▴" : "▾"}
              </span>
            </button>

            {acikMi && (
              <>
                {k.nis && (
                  <span style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>
                    <b>{t("Nişin")}:</b> {k.nis}
                  </span>
                )}

                {k.hashtagler.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Instagram'da bak:")}</span>
                    {k.hashtagler.map((h) => (
                      <a
                        key={h}
                        href={`https://www.instagram.com/explore/tags/${encodeURIComponent(h)}/`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: c.primary, background: `${c.primary}12`, borderRadius: 999, padding: "2px 9px", textDecoration: "none" }}
                      >
                        #{h}
                      </a>
                    ))}
                  </div>
                )}

                {k.aramalar.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Kendin ara:")}</span>
                    {k.aramalar.map((a) => (
                      <a
                        key={a}
                        href={`https://www.google.com/search?q=${encodeURIComponent(`${a} site:instagram.com`)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: c.primary }}
                      >
                        {a} ↗
                      </a>
                    ))}
                  </div>
                )}

                {k.adaylar.length === 0 && (
                  <span style={{ fontSize: 13, color: c.textSecondary }}>
                    {t("Bu aramada kaynağıyla birlikte aday bulunamadı; yukarıdaki etiketlere ve aramalara bakabilirsin.")}
                  </span>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
                  {k.adaylar.map((a) => {
                    const kaynak = safeExternalUrl(a.kaynak);
                    const panoda = panodakiler.has(a.handle);
                    return (
                      <div
                        key={a.handle}
                        style={{
                          border: `1px solid ${a.dogrulandi ? c.border : `${c.warning}66`}`,
                          borderRadius: 8,
                          padding: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          background: c.surface,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                          <a
                            href={profilAdresi(a)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 14, fontWeight: 600, color: c.primary, textDecoration: "none" }}
                          >
                            @{a.handle} ↗
                          </a>
                          {a.ad && <span style={{ fontSize: 12, color: c.textSecondary }}>{a.ad}</span>}
                          {a.platform !== "instagram" && (
                            <span style={{ fontSize: 11, color: c.textSecondary }}>· {a.platform}</span>
                          )}
                        </div>
                        {a.neden && <span style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>{a.neden}</span>}
                        {a.dogrulandi && kaynak ? (
                          <a href={kaynak} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: c.textSecondary }}>
                            {t("Kaynak")}: {a.kaynakBaslik || new URL(kaynak).hostname} ↗
                          </a>
                        ) : (
                          <span style={{ fontSize: 11, color: c.warning }}>
                            {t("Kaynağı bu aramada doğrulanamadı — profiline bakıp emin ol.")}
                          </span>
                        )}
                        {canWrite && (
                          <button
                            type="button"
                            disabled={panoda || ekleniyor !== null}
                            onClick={() => void panoyaEkle(a)}
                            style={{
                              ...ikincilDugme,
                              alignSelf: "flex-start",
                              marginTop: "auto",
                              color: panoda ? c.success : c.primary,
                              cursor: panoda || ekleniyor !== null ? "default" : "pointer",
                            }}
                          >
                            {panoda ? `✓ ${t("Panoda")}` : ekleniyor === a.handle ? t("Ekleniyor…") : `+ ${t("İlham panosuna ekle")}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontSize: 11, color: c.textSecondary }}>
                  {t("{n} web araması · {birim} birim", { n: k.aramaSayisi, birim: k.kredi })}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
