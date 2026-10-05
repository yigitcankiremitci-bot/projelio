import { useCallback, useEffect, useMemo, useState } from "react";
import type { PerformansSonucu, SocialAccountMediaItem, SocialAnalyticsOverview } from "@projelio/shared";
import {
  icerikTuru,
  kaydetPaylasOrani,
  medyan,
  performansDegeri,
  performanslar,
  saatOzeti,
  turOzeti,
} from "@projelio/shared";
import { socialMediaApi, type SocialScope } from "../../api/socialMedia";
import { parseServerDate } from "../../lib/dates";
import { useT } from "../../lib/i18n";
import { bicimDili, yuzde } from "../../lib/i18n/depo";
import FikirRaporlari from "./FikirRaporlari";
import GonderiAnalizModal from "./GonderiAnalizModal";
import IlerleyisPaneli from "./IlerleyisPaneli";
import IlhamPanosu from "./IlhamPanosu";
import { kisaSayi, PerformansRozeti, sureYazisi, turAdi, useAnalizStilleri } from "./ortak";

interface Props {
  scope: SocialScope;
  canWrite: boolean;
  /** Instagram bağlama akışı (SocialMediaPanel'deki) — yeniden bağlama da aynı yoldan. */
  onInstagramBagla: () => void;
  baglaniyor: boolean;
  /** Bir fikir takvime eklendi: üstteki takvim tazelensin. */
  onIcerikEklendi: () => void;
}

type AltSekme = "gonderiler" | "ilerleyis" | "ilham" | "fikirler";
type Siralama = "tarih" | "kat" | "izlenme" | "kaydet";

/**
 * Sosyal Medya > Analiz ve fikirler.
 *
 * Üç soru, üç alt sekme:
 *   Gönderilerim   "hangi videom neden ne kadar izlendi" — kendi hesabının
 *                  metrikleri, hesabın normaline göre rozetle; Lio tek tek analiz eder
 *   İlham panosu   "benim tarzımda kim ne yapıyor" — elle eklenen kaynaklar
 *   Fikirler       "ne çekeyim" — Lio ikisini birleştirip fikir üretir
 *
 * "İyi gitti mi" hesabı packages/shared/src/icerikAnalizi.ts'te; Lio'ya giden
 * özet de aynı koddan geçiyor, ekranla Lio aynı videoyu "yıldız" sayar.
 */
export default function IcerikAnaliziPanel({ scope, canWrite, onInstagramBagla, baglaniyor, onIcerikEklendi }: Props) {
  const t = useT();
  const { c, kart, ikincilDugme, birincilDugme } = useAnalizStilleri();
  const [veri, setVeri] = useState<SocialAnalyticsOverview | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [altSekme, setAltSekme] = useState<AltSekme>("gonderiler");
  const [hesapFiltre, setHesapFiltre] = useState("");
  const [turFiltre, setTurFiltre] = useState("");
  const [siralama, setSiralama] = useState<Siralama>("kat");
  const [secili, setSecili] = useState<SocialAccountMediaItem | null>(null);
  const [senkron, setSenkron] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState("");

  const yukle = useCallback(async () => {
    setHata("");
    try {
      setVeri(await socialMediaApi.analiz(scope));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Analiz yüklenemedi"));
    } finally {
      setYukleniyor(false);
    }
  }, [scope, t]);

  useEffect(() => {
    setYukleniyor(true);
    void yukle();
  }, [yukle]);

  const simdi = useMemo(() => new Date(), [veri]);
  const medya = useMemo(
    () =>
      (veri?.medya ?? []).filter(
        (m) => (!hesapFiltre || m.accountId === hesapFiltre) && (!turFiltre || icerikTuru(m) === turFiltre)
      ),
    [veri, hesapFiltre, turFiltre]
  );
  // Performans BÜTÜN gönderilerle hesaplanır (tür filtresi normali değiştirmesin):
  // yalnızca reels'e bakınca reels'in medyanı "normal" olurdu.
  const perf = useMemo(() => performanslar(veri?.medya ?? [], simdi), [veri, simdi]);

  const sirali = useMemo(() => {
    const deger = (m: SocialAccountMediaItem): number => {
      if (siralama === "tarih") return m.postedAt ? parseServerDate(m.postedAt).getTime() : 0;
      if (siralama === "kat") return perf.get(m.id)?.kat ?? -1;
      if (siralama === "izlenme") return performansDegeri(m) ?? -1;
      return kaydetPaylasOrani(m) ?? -1;
    };
    return [...medya].sort((a, b) => deger(b) - deger(a));
  }, [medya, siralama, perf]);

  const ozet = useMemo(() => {
    const degerler = medya.map(performansDegeri).filter((d): d is number => d !== null);
    const oranlar = medya.map(kaydetPaylasOrani).filter((o): o is number => o !== null);
    const turler = turOzeti(medya, simdi).filter((x) => x.medyanDeger !== null);
    const saatler = saatOzeti(medya, simdi, (iso) => parseServerDate(iso).getHours());
    return {
      adet: medya.length,
      medyan: medyan(degerler),
      oran: medyan(oranlar),
      enIyiTur: turler.length > 1 ? turler[0] : null,
      enIyiSaat: saatler[0] ?? null,
    };
  }, [medya, simdi]);

  const senkronla = async (accountId: string) => {
    setSenkron(accountId);
    setBilgi("");
    try {
      const sonuc = await socialMediaApi.analizSenkron(accountId);
      setBilgi(
        sonuc.atlandi
          ? t("Veriler birkaç dakika önce güncellendi; biraz sonra tekrar dene.")
          : t("{n} gönderi okundu, {m} gönderinin metrikleri güncellendi.", { n: sonuc.medya, m: sonuc.metrik })
      );
      await yukle();
    } catch (err) {
      setBilgi(err instanceof Error ? err.message : t("Güncellenemedi"));
    } finally {
      setSenkron(null);
    }
  };

  if (yukleniyor) return <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>;
  if (!veri) return <span style={{ fontSize: 12, color: c.danger }}>{hata || t("Analiz yüklenemedi")}</span>;

  const hesaplar = veri.hesaplar;
  const handleOf = new Map(hesaplar.map((h) => [h.accountId, h.handle]));

  const altSekmeDugmesi = (deger: AltSekme, yazi: string) => (
    <button
      key={deger}
      type="button"
      onClick={() => setAltSekme(deger)}
      style={{
        fontSize: 13,
        padding: "6px 2px",
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${altSekme === deger ? c.primary : "transparent"}`,
        color: altSekme === deger ? c.primary : c.textSecondary,
        fontWeight: altSekme === deger ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {yazi}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Bağlantı durumu: hesap yok / yeniden bağlanmalı / senkron hatası */}
      {hesaplar.length === 0 ? (
        <div style={{ ...kart, borderStyle: "dashed", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>
            {veri.ayarli
              ? t(
                  "Gönderilerinin izlenme, erişim, kaydetme ve paylaşım verilerini görmek için Instagram profesyonel hesabını bağla. İlham panosunu bağlamadan da kullanabilirsin."
                )
              : t("Instagram entegrasyonu bu kurulumda yapılandırılmamış; ilham panosunu ve fikir raporlarını yine de kullanabilirsin.")}
          </span>
          {veri.ayarli && canWrite && (
            <button
              type="button"
              onClick={onInstagramBagla}
              disabled={baglaniyor}
              style={{ ...birincilDugme, alignSelf: "flex-start", opacity: baglaniyor ? 0.6 : 1 }}
            >
              {baglaniyor ? t("Yönlendiriliyor…") : t("Instagram'ı bağla")}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hesaplar.map((h) => (
            <div key={h.accountId} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
              <span style={{ fontWeight: 500, color: c.textPrimary }}>@{h.handle}</span>
              {typeof h.followerCount === "number" && (
                <span style={{ color: c.textSecondary }}>{t("{n} takipçi", { n: kisaSayi(h.followerCount) })}</span>
              )}
              <span style={{ color: c.textSecondary }}>
                {h.insightsSyncedAt
                  ? t("Son güncelleme: {zaman}", {
                      zaman: parseServerDate(h.insightsSyncedAt).toLocaleString(bicimDili(), {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })
                  : t("Henüz veri çekilmedi")}
              </span>
              <button
                type="button"
                onClick={() => void senkronla(h.accountId)}
                disabled={senkron !== null}
                style={{ ...ikincilDugme, opacity: senkron !== null ? 0.6 : 1 }}
              >
                {senkron === h.accountId ? t("Instagram'dan okunuyor…") : t("Şimdi güncelle")}
              </button>
              {h.yenidenBaglanmali ? (
                <span style={{ color: c.warning, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {t("İzlenme ve erişim verileri için bağlantıyı yenile (yeni izin).")}
                  {canWrite && (
                    <button
                      type="button"
                      onClick={onInstagramBagla}
                      disabled={baglaniyor}
                      style={{ ...ikincilDugme, borderColor: c.warning, color: c.warning }}
                    >
                      {t("Yeniden bağla")}
                    </button>
                  )}
                </span>
              ) : (
                // Sunucu bu metni Türkçe anahtar olarak yazıyor (bkz. instagram-insights
                // .service); Meta'nın kendi İngilizce hatası sözlükte yoksa olduğu gibi kalır.
                h.insightsError && <span style={{ color: c.danger }}>{t(h.insightsError)}</span>
              )}
            </div>
          ))}
          {bilgi && <span style={{ fontSize: 12, color: c.textSecondary }}>{bilgi}</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, borderBottom: `1px solid ${c.border}`, flexWrap: "wrap" }}>
        {altSekmeDugmesi("gonderiler", `${t("Gönderilerim")} · ${veri.medya.length}`)}
        {altSekmeDugmesi("ilerleyis", t("İlerleyiş"))}
        {altSekmeDugmesi("ilham", `${t("İlham panosu")} · ${veri.ilhamlar.length}`)}
        {altSekmeDugmesi("fikirler", t("Fikirler"))}
      </div>

      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}

      {altSekme === "gonderiler" && (
        <>
          {veri.medya.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {[
                { ad: t("Gönderi"), deger: String(ozet.adet) },
                { ad: t("Normal (medyan) izlenme"), deger: kisaSayi(ozet.medyan) },
                {
                  ad: t("Kaydetme + paylaşım (medyan)"),
                  deger:
                    ozet.oran === null
                      ? "–"
                      : yuzde((ozet.oran * 100).toLocaleString(bicimDili(), { maximumFractionDigits: 1 })),
                },
                { ad: t("En iyi giden format"), deger: ozet.enIyiTur ? turAdi(ozet.enIyiTur.tur, t) : "–" },
                {
                  ad: t("En iyi paylaşım saati"),
                  deger: ozet.enIyiSaat ? `${String(ozet.enIyiSaat.saat).padStart(2, "0")}:00` : "–",
                },
              ].map((k) => (
                <div key={k.ad} style={{ ...kart, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, color: c.textSecondary }}>{k.ad}</span>
                  <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary }}>{k.deger}</span>
                </div>
              ))}
            </div>
          )}

          {veri.medya.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {hesaplar.length > 1 && (
                <select value={hesapFiltre} onChange={(e) => setHesapFiltre(e.target.value)} style={{ fontSize: 12, padding: "4px 6px" }}>
                  <option value="">{t("Tüm hesaplar")}</option>
                  {hesaplar.map((h) => (
                    <option key={h.accountId} value={h.accountId}>
                      @{h.handle}
                    </option>
                  ))}
                </select>
              )}
              <select value={turFiltre} onChange={(e) => setTurFiltre(e.target.value)} style={{ fontSize: 12, padding: "4px 6px" }}>
                <option value="">{t("Tüm formatlar")}</option>
                {(["reels", "karusel", "gorsel", "video"] as const).map((tur) => (
                  <option key={tur} value={tur}>
                    {turAdi(tur, t)}
                  </option>
                ))}
              </select>
              <select
                value={siralama}
                onChange={(e) => setSiralama(e.target.value as Siralama)}
                style={{ fontSize: 12, padding: "4px 6px", marginLeft: "auto" }}
              >
                <option value="kat">{t("Sırala: normale göre")}</option>
                <option value="izlenme">{t("Sırala: izlenme")}</option>
                <option value="kaydet">{t("Sırala: kaydetme + paylaşım oranı")}</option>
                <option value="tarih">{t("Sırala: en yeni")}</option>
              </select>
            </div>
          )}

          {veri.medya.length === 0 && hesaplar.length > 0 && (
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              {t('Henüz gönderi verisi yok. "Şimdi güncelle" ile Instagram\'dan çek; her gece kendiliğinden de güncellenir.')}
            </span>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sirali.map((m) => (
              <GonderiSatiri
                key={m.id}
                gonderi={m}
                handle={hesaplar.length > 1 ? handleOf.get(m.accountId) : undefined}
                perf={perf.get(m.id)}
                onAc={() => setSecili(m)}
              />
            ))}
          </div>
        </>
      )}

      {altSekme === "ilerleyis" && <IlerleyisPaneli scope={scope} hesaplar={hesaplar} medya={veri.medya} />}

      {altSekme === "ilham" && (
        <IlhamPanosu
          scope={scope}
          ilhamlar={veri.ilhamlar}
          canWrite={canWrite}
          onDegisti={(ilhamlar) => setVeri((v) => (v ? { ...v, ilhamlar } : v))}
          hesaplar={hesaplar}
          kesifler={veri.kesifler ?? []}
          kesifAcik={veri.kesifAcik ?? false}
          onYeniKesif={(kesif) => setVeri((v) => (v ? { ...v, kesifler: [kesif, ...(v.kesifler ?? [])].slice(0, 5) } : v))}
        />
      )}

      {altSekme === "fikirler" && (
        <FikirRaporlari
          scope={scope}
          hesaplar={hesaplar}
          raporlar={veri.raporlar}
          gonderiSayisi={veri.medya.length}
          ilhamSayisi={veri.ilhamlar.length}
          canWrite={canWrite}
          onYeniRapor={(rapor) => setVeri((v) => (v ? { ...v, raporlar: [rapor, ...v.raporlar].slice(0, 5) } : v))}
          onIcerikEklendi={onIcerikEklendi}
        />
      )}

      {secili && (
        <GonderiAnalizModal
          gonderi={secili}
          performans={perf.get(secili.id)}
          handle={handleOf.get(secili.accountId)}
          canWrite={canWrite}
          onClose={() => setSecili(null)}
          onGuncellendi={(g) => {
            setSecili(g);
            setVeri((v) => (v ? { ...v, medya: v.medya.map((x) => (x.id === g.id ? g : x)) } : v));
          }}
        />
      )}
    </div>
  );
}

function GonderiSatiri({
  gonderi,
  handle,
  perf,
  onAc,
}: {
  gonderi: SocialAccountMediaItem;
  handle?: string;
  perf?: PerformansSonucu;
  onAc: () => void;
}) {
  const t = useT();
  const { c } = useAnalizStilleri();
  const [kapakYok, setKapakYok] = useState(false);
  const oran = kaydetPaylasOrani(gonderi);
  const izleme = sureYazisi(gonderi.avgWatchTimeMs);
  const ilkSatir = gonderi.caption?.split("\n").find((s) => s.trim()) ?? "";

  const metrik = (ad: string, deger: string) => (
    <span style={{ whiteSpace: "nowrap" }}>
      <span style={{ color: c.textSecondary }}>{ad}</span> <span style={{ color: c.textPrimary }}>{deger}</span>
    </span>
  );

  return (
    <button
      type="button"
      onClick={onAc}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: 8,
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: c.surface,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div
        style={{
          width: 52,
          height: 64,
          flexShrink: 0,
          borderRadius: 6,
          overflow: "hidden",
          background: c.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: c.textSecondary,
        }}
      >
        {gonderi.thumbnailUrl && !kapakYok ? (
          <img
            src={gonderi.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setKapakYok(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          turAdi(icerikTuru(gonderi), t)
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: c.textSecondary }}>
          <span>{turAdi(icerikTuru(gonderi), t)}</span>
          {gonderi.postedAt && (
            <span>
              {parseServerDate(gonderi.postedAt).toLocaleDateString(bicimDili(), { day: "numeric", month: "short" })}
            </span>
          )}
          {handle && <span>@{handle}</span>}
          <PerformansRozeti etiket={perf?.etiket} kat={perf?.kat} t={t} />
          {gonderi.lioAnaliz && <span style={{ color: c.primary }}>✦ {t("Lio analizi var")}</span>}
        </div>
        {ilkSatir && (
          <span
            style={{
              fontSize: 13,
              color: c.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {ilkSatir}
          </span>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
          {gonderi.views !== undefined || gonderi.reach === undefined
            ? metrik(t("İzlenme"), kisaSayi(gonderi.views))
            : metrik(t("Erişim"), kisaSayi(gonderi.reach))}
          {metrik(t("Kaydetme"), kisaSayi(gonderi.saved))}
          {metrik(t("Paylaşım"), kisaSayi(gonderi.shares))}
          {oran !== null &&
            metrik(t("Oran"), yuzde((oran * 100).toLocaleString(bicimDili(), { maximumFractionDigits: 1 })))}
          {izleme && metrik(t("Ort. izlenme"), izleme)}
        </div>
      </div>
    </button>
  );
}
