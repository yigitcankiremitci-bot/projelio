import { useCallback, useEffect, useMemo, useState } from "react";
import type { SocialCompetitor, SocialCompetitorOverview, SocialHashtagTrack, SocialMetaUsage } from "@projelio/shared";
import { etkilesim, rakipKatlari, rakipOzeti, safeExternalUrl } from "@projelio/shared";
import { socialMediaApi, type SocialScope } from "../../api/socialMedia";
import { parseServerDate } from "../../lib/dates";
import { useT } from "../../lib/i18n";
import { bicimDili, yuzde } from "../../lib/i18n/depo";
import { IconActivity, IconLink, IconUser } from "../icons";
import { BolumBasligi, useBolumRenkleri } from "./gezinme";
import { CizgiGrafik } from "./grafikler";
import { katYazisi, kisaSayi, useAnalizStilleri } from "./ortak";

interface Props {
  scope: SocialScope;
  canWrite: boolean;
}

const MAX_RAKIP = 40;

function tarih(iso: string | undefined, saatli = false): string {
  if (!iso) return "–";
  return parseServerDate(iso).toLocaleString(bicimDili(), {
    day: "numeric",
    month: "short",
    ...(saatli ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  });
}

/**
 * Sosyal Medya > Analiz > Rakipler.
 *
 * Facebook Login bağlantısıyla (Instagram hesabı bir Sayfaya bağlı olmalı):
 *   · ilham panosundaki "hesap" kayıtları takibe alınır → her gece takipçi +
 *     son 30 gönderi (beğeni/yorum; izlenme rakip için YOK)
 *   · hashtag takibi → etiketin en popüler ve son 24 saat gönderileri
 *   · Sınırlar kartı: Meta'nın haftalık 30 hashtag kuralı ve çağrı kullanım
 *     yüzdeleri — kullanıcı neden bir şeyin eklenemediğini görebilsin.
 *
 * Şimdilik yalnızca izinli hesaplara açık (sunucuda RAKIP_TAKIP_EPOSTALARI).
 */
export default function RakiplerPaneli({ scope, canWrite }: Props) {
  const t = useT();
  const { c, kart, ikincilDugme, birincilDugme, alan } = useAnalizStilleri();
  const renk = useBolumRenkleri().rakipler;
  const [veri, setVeri] = useState<SocialCompetitorOverview | null>(null);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [yeniEtiket, setYeniEtiket] = useState("");
  const [acik, setAcik] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    try {
      setVeri(await socialMediaApi.rakipler(scope));
      setHata("");
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Rakipler yüklenemedi"));
    }
  }, [scope, t]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const is = async (anahtar: string, fn: () => Promise<unknown>, basari?: string) => {
    setMesgul(anahtar);
    setHata("");
    setBilgi("");
    try {
      await fn();
      if (basari) setBilgi(basari);
      await yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İşlem tamamlanamadı"));
    } finally {
      setMesgul(null);
    }
  };

  const baglan = () =>
    is("baglan", async () => {
      const { url } = await socialMediaApi.facebookConnectUrl(scope, `${window.location.pathname}${window.location.search}`);
      window.location.href = url;
    });

  if (!veri) {
    return hata ? (
      <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>
    ) : (
      <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>
    );
  }

  const takipte = veri.rakipler.filter((r) => r.takip);
  const b = veri.baglanti;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ---------------- Bağlantı ---------------- */}
      <div style={{ ...kart, display: "flex", flexDirection: "column", gap: 8 }}>
        <BolumBasligi ikon={<IconLink size={15} />} renk={renk} baslik={t("Facebook bağlantısı")} />
        {!veri.ayarli ? (
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            {t("Sunucuda Facebook uygulaması tanımlı değil (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).")}
          </span>
        ) : !b ? (
          <>
            <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>
              {t(
                "Başka hesapların herkese açık verisi ve hashtag araması yalnızca Facebook ile bağlanınca açılıyor. Instagram hesabının bir Facebook Sayfasına bağlı olması gerekir. Bu bağlantı yalnızca okur; yayın mevcut Instagram bağlantısından sürer."
              )}
            </span>
            {canWrite && (
              <button
                type="button"
                onClick={() => void baglan()}
                disabled={mesgul !== null}
                style={{ ...birincilDugme, alignSelf: "flex-start", opacity: mesgul ? 0.6 : 1 }}
              >
                {mesgul === "baglan" ? t("Yönlendiriliyor…") : t("Facebook ile bağlan")}
              </button>
            )}
          </>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ color: c.textPrimary, fontWeight: 500 }}>@{b.igUsername}</span>
            {b.pageName && <span style={{ color: c.textSecondary }}>· {t("Sayfa: {ad}", { ad: b.pageName })}</span>}
            {b.hata && <span style={{ color: c.danger }}>{t(b.hata)}</span>}
            {canWrite && (
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {b.hata && (
                  <button type="button" onClick={() => void baglan()} style={{ ...ikincilDugme, color: c.warning, borderColor: c.warning }}>
                    {t("Yeniden bağla")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t("Facebook bağlantısı kaldırılsın mı? Rakip ve hashtag geçmişi kalır, yeni veri gelmez.")))
                      void is("kaldir", () => socialMediaApi.facebookKaldir(scope));
                  }}
                  style={{ ...ikincilDugme, color: c.danger }}
                >
                  {t("Bağlantıyı kaldır")}
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
      {bilgi && <span style={{ fontSize: 12, color: c.textSecondary }}>{bilgi}</span>}

      {b && (
        <SinirlarKarti
          kullanim={b.kullanim}
          kullanimAt={b.kullanimAt}
          hashtag={veri.hashtagKullanimi}
          rakipSayisi={takipte.length}
        />
      )}

      {/* ---------------- Rakipler ---------------- */}
      <div style={{ ...kart, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <BolumBasligi
              ikon={<IconUser size={15} />}
              renk={renk}
              baslik={t("Takip edilen hesaplar")}
              aciklama={t("Her gece güncellenir · yalnızca işletme ve içerik üreticisi hesapları")}
            />
          </div>
          {canWrite && b && takipte.length > 0 && (
            <button
              type="button"
              onClick={() =>
                void is(
                  "senkron",
                  async () => {
                    const s = await socialMediaApi.rakipSenkron(scope);
                    setBilgi(
                      s.okunan === 0 && s.atlanan > 0
                        ? t("Hepsi birkaç dakika önce güncellendi.")
                        : t("{n} hesap güncellendi.", { n: s.okunan })
                    );
                  }
                )
              }
              disabled={mesgul !== null}
              style={{ ...ikincilDugme, marginLeft: "auto", opacity: mesgul ? 0.6 : 1 }}
            >
              {mesgul === "senkron" ? t("Meta'dan okunuyor…") : t("Şimdi güncelle")}
            </button>
          )}
        </div>

        {veri.rakipler.length === 0 && (
          <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>
            {t(
              'Takip edilecek hesap yok. İlham panosuna "Takip ettiğim hesap" türünde ve kullanıcı adıyla kayıt ekle ya da "Benzer hesap bul"dan ekle; burada takibe alabilirsin.'
            )}
          </span>
        )}

        {veri.rakipler.map((r) => (
          <RakipSatiri
            key={r.inspirationId}
            r={r}
            acik={acik === r.inspirationId}
            onAc={() => setAcik(acik === r.inspirationId ? null : r.inspirationId)}
            takipEdilebilir={canWrite && !!b && (r.takip || takipte.length < MAX_RAKIP)}
            mesgul={mesgul === r.inspirationId}
            onTakip={(takip) => void is(r.inspirationId, () => socialMediaApi.rakipTakip(r.inspirationId, takip))}
          />
        ))}
      </div>

      {/* ---------------- Hashtagler ---------------- */}
      <div style={{ ...kart, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <BolumBasligi
            ikon={<span style={{ fontSize: 15, fontWeight: 700 }}>#</span>}
            renk={renk}
            baslik={t("Hashtag takibi")}
            aciklama={t("En popüler ve son 24 saatin gönderileri · her gece güncellenir")}
          />
        </div>
        {canWrite && b && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!yeniEtiket.trim()) return;
              void is("etiket", async () => {
                await socialMediaApi.hashtagEkle(scope, yeniEtiket);
                setYeniEtiket("");
              });
            }}
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <input
              value={yeniEtiket}
              onChange={(e) => setYeniEtiket(e.target.value)}
              placeholder={t("#hashtag")}
              disabled={veri.hashtagKullanimi.kullanilan >= veri.hashtagKullanimi.sinir}
              style={{ ...alan, flex: "1 1 200px", width: "auto" }}
            />
            <button
              type="submit"
              disabled={mesgul !== null || veri.hashtagKullanimi.kullanilan >= veri.hashtagKullanimi.sinir}
              style={{ ...birincilDugme, opacity: mesgul ? 0.6 : 1 }}
            >
              {mesgul === "etiket" ? t("Ekleniyor…") : t("Takibe al")}
            </button>
          </form>
        )}
        {veri.hashtagler.length === 0 && (
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            {b ? t("Henüz takip edilen hashtag yok.") : t("Hashtag takibi için önce Facebook ile bağlan.")}
          </span>
        )}
        {veri.hashtagler.map((h) => (
          <HashtagKarti
            key={h.id}
            h={h}
            canWrite={canWrite}
            mesgul={mesgul === h.id}
            onAyarla={(aktif) => void is(h.id, () => socialMediaApi.hashtagAyarla(h.id, aktif))}
            onSil={() => {
              if (window.confirm(t("#{etiket} takibi silinsin mi? Toplanan gönderiler de silinir.", { etiket: h.hashtag })))
                void is(h.id, () => socialMediaApi.hashtagSil(h.id));
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Meta sınırları: haftalık hashtag hakkı, takip edilen hesap sayısı ve
 * çağrı kullanım yüzdeleri. Yüzdeler Meta'nın son yanıtındaki başlıklardan
 * — "şu an" değil, son ölçüm; saati yanında yazılı.
 */
function SinirlarKarti({
  kullanim,
  kullanimAt,
  hashtag,
  rakipSayisi,
}: {
  kullanim?: SocialMetaUsage;
  kullanimAt?: string;
  hashtag: { kullanilan: number; sinir: number; yenilenme?: string };
  rakipSayisi: number;
}) {
  const t = useT();
  const { c, kart } = useAnalizStilleri();
  const bolumRengi = useBolumRenkleri().rakipler;
  const uygulama = kullanim ? Math.max(kullanim.callCount ?? 0, kullanim.totalTime ?? 0, kullanim.totalCputime ?? 0) : null;

  const cubuk = (ad: string, deger: number | null, sinir: number, alt: string) => {
    const oran = deger === null ? 0 : Math.min(1, deger / sinir);
    const renk = oran >= 0.85 ? c.danger : oran >= 0.6 ? c.warning : c.success;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
          <span style={{ color: c.textSecondary }}>{ad}</span>
          <span style={{ color: c.textPrimary, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
            {deger === null ? "–" : sinir === 100 ? yuzde(Math.round(deger)) : `${deger} / ${sinir}`}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: c.border, overflow: "hidden" }}>
          <div style={{ width: `${oran * 100}%`, height: "100%", background: renk, borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 11, color: c.textSecondary }}>{alt}</span>
      </div>
    );
  };

  return (
    <div style={{ ...kart, display: "flex", flexDirection: "column", gap: 10 }}>
      <BolumBasligi
        ikon={<IconActivity size={15} />}
        renk={bolumRengi}
        baslik={t("Sınırlar")}
        aciklama={t("Meta'nın koyduğu sınırlar — dolarsa yeni istekler bir süre reddedilir.")}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {cubuk(
          t("Haftalık hashtag hakkı"),
          hashtag.kullanilan,
          hashtag.sinir,
          hashtag.kullanilan >= hashtag.sinir && hashtag.yenilenme
            ? t("Doldu · ilk hak {tarih} boşalır", { tarih: tarih(hashtag.yenilenme, true) })
            : t("Meta: 7 günde en fazla {n} farklı hashtag", { n: hashtag.sinir })
        )}
        {cubuk(t("Takip edilen hesap"), rakipSayisi, MAX_RAKIP, t("Gece başına hesap başı 1 istek"))}
        {cubuk(
          t("Meta uygulama kullanımı"),
          uygulama,
          100,
          kullanimAt ? t("Son ölçüm {tarih}", { tarih: tarih(kullanimAt, true) }) : t("Henüz ölçüm yok")
        )}
        {cubuk(
          t("Instagram işletme kullanımı"),
          kullanim?.isletme ?? null,
          100,
          kullanim?.beklemeDk
            ? t("Sınır aşıldı · {n} dk sonra açılır", { n: kullanim.beklemeDk })
            : t("Saatlik pencere; %100'de istekler geçici reddedilir")
        )}
      </div>
    </div>
  );
}

function RakipSatiri({
  r,
  acik,
  onAc,
  takipEdilebilir,
  mesgul,
  onTakip,
}: {
  r: SocialCompetitor;
  acik: boolean;
  onAc: () => void;
  takipEdilebilir: boolean;
  mesgul: boolean;
  onTakip: (takip: boolean) => void;
}) {
  const t = useT();
  const { c, ikincilDugme } = useAnalizStilleri();
  const bolumRengi = useBolumRenkleri().rakipler;
  const simdi = useMemo(() => new Date(), [r]);
  const ozet = useMemo(() => rakipOzeti(r.gonderiler, r.takipciGecmisi, r.profil?.takipci, simdi), [r, simdi]);
  const katlar = useMemo(() => rakipKatlari(r.gonderiler, simdi), [r, simdi]);
  const enIyiler = useMemo(
    () =>
      [...r.gonderiler]
        .filter((g) => (katlar.get(g.externalMediaId) ?? null) !== null)
        .sort((a, b) => (katlar.get(b.externalMediaId) ?? 0) - (katlar.get(a.externalMediaId) ?? 0))
        .slice(0, 6),
    [r, katlar]
  );

  const degisim = (n: number | null) =>
    n === null ? null : (
      <span style={{ color: n >= 0 ? c.success : c.danger }}>
        {n >= 0 ? "+" : "−"}
        {kisaSayi(Math.abs(n))}
      </span>
    );

  return (
    <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: c.textSecondary, cursor: takipEdilebilir ? "pointer" : "default" }}>
          <input
            type="checkbox"
            checked={r.takip}
            disabled={!takipEdilebilir || mesgul}
            onChange={(e) => onTakip(e.target.checked)}
          />
          {t("Takip")}
        </label>
        <a
          href={`https://www.instagram.com/${r.handle}/`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, fontWeight: 600, color: c.primary, textDecoration: "none" }}
        >
          @{r.handle} ↗
        </a>
        {r.profil?.ad && <span style={{ fontSize: 12, color: c.textSecondary }}>{r.profil.ad}</span>}
        {mesgul && <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Meta'dan okunuyor…")}</span>}
        {r.takip && !r.hata && r.syncedAt && (
          <button type="button" onClick={onAc} style={{ ...ikincilDugme, marginLeft: "auto" }}>
            {acik ? t("Gizle") : t("Ayrıntı")}
          </button>
        )}
      </div>

      {r.takip && r.hata && <span style={{ fontSize: 12, color: c.danger }}>{t(r.hata)}</span>}

      {r.takip && !r.hata && r.syncedAt && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
          <span>
            <span style={{ color: c.textSecondary }}>{t("Takipçi")}</span>{" "}
            <b style={{ color: c.textPrimary }}>{kisaSayi(r.profil?.takipci)}</b>{" "}
            {degisim(ozet.takipciDegisim7)}
          </span>
          <span>
            <span style={{ color: c.textSecondary }}>{t("Haftada")}</span>{" "}
            <b style={{ color: c.textPrimary }}>{ozet.haftalikGonderi.toLocaleString(bicimDili())}</b>{" "}
            <span style={{ color: c.textSecondary }}>{t("gönderi")}</span>
          </span>
          <span>
            <span style={{ color: c.textSecondary }}>{t("Normal etkileşim")}</span>{" "}
            <b style={{ color: c.textPrimary }}>{kisaSayi(ozet.medyanEtkilesim)}</b>
            {ozet.etkilesimOrani !== null && (
              <span style={{ color: c.textSecondary }}> ({yuzde(ozet.etkilesimOrani.toLocaleString(bicimDili()))})</span>
            )}
          </span>
          <span style={{ color: c.textSecondary }}>{t("Güncellendi {tarih}", { tarih: tarih(r.syncedAt, true) })}</span>
        </div>
      )}

      {acik && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
          <CizgiGrafik
            renk={bolumRengi}
            baslik={t("Takipçi")}
            noktalar={r.takipciGecmisi.map((n) => ({
              x: Date.parse(`${n.gun}T12:00:00Z`),
              y: n.deger,
              xYazi: new Date(`${n.gun}T12:00:00Z`).toLocaleDateString(bicimDili(), { day: "numeric", month: "short" }),
            }))}
            yBicim={kisaSayi}
            xEtiket={(n) => n.xYazi}
            yukseklik={150}
            bos={t("Takipçi sayısı her gece kaydediliyor; ikinci günden itibaren çizgi görünür.")}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.textPrimary }}>{t("Normalinin üstünde giden gönderileri")}</span>
            {enIyiler.length === 0 && (
              <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Kıyas için yeterli gönderi yok.")}</span>
            )}
            {enIyiler.map((g) => {
              const link = safeExternalUrl(g.permalink);
              const kat = katlar.get(g.externalMediaId);
              return (
                <div key={g.externalMediaId} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: (kat ?? 0) >= 2 ? c.success : c.textSecondary, fontWeight: 600, minWidth: 36 }}>
                    {kat !== null && kat !== undefined ? `${katYazisi(kat)}×` : "–"}
                  </span>
                  <span
                    style={{ flex: 1, minWidth: 0, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {g.caption?.split("\n")[0] || t("(açıklama yok)")}
                  </span>
                  <span style={{ color: c.textSecondary, whiteSpace: "nowrap" }}>{kisaSayi(etkilesim(g))}</span>
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" style={{ color: c.primary }}>
                      ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function HashtagKarti({
  h,
  canWrite,
  mesgul,
  onAyarla,
  onSil,
}: {
  h: SocialHashtagTrack;
  canWrite: boolean;
  mesgul: boolean;
  onAyarla: (aktif: boolean) => void;
  onSil: () => void;
}) {
  const t = useT();
  const { c, ikincilDugme } = useAnalizStilleri();
  const [tur, setTur] = useState<"top" | "recent">("top");
  const liste = h.gonderiler.filter((g) => g.tur === tur);

  return (
    <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <a
          href={`https://www.instagram.com/explore/tags/${encodeURIComponent(h.hashtag)}/`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, fontWeight: 600, color: h.aktif ? c.primary : c.textSecondary, textDecoration: "none" }}
        >
          #{h.hashtag} ↗
        </a>
        {!h.aktif && <span style={{ fontSize: 11, color: c.textSecondary }}>{t("durduruldu")}</span>}
        <span style={{ fontSize: 11, color: c.textSecondary }}>
          {h.sonSorgu ? t("Güncellendi {tarih}", { tarih: tarih(h.sonSorgu, true) }) : t("Henüz sorgulanmadı")}
        </span>
        {h.hata && <span style={{ fontSize: 11, color: c.danger }}>{t(h.hata)}</span>}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {(["top", "recent"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTur(k)}
              style={{
                ...ikincilDugme,
                padding: "3px 8px",
                borderColor: tur === k ? c.primary : c.border,
                color: tur === k ? c.primary : c.textSecondary,
              }}
            >
              {k === "top" ? t("Popüler") : t("Son 24 saat")}
            </button>
          ))}
          {canWrite && (
            <>
              <button type="button" disabled={mesgul} onClick={() => onAyarla(!h.aktif)} style={ikincilDugme}>
                {h.aktif ? t("Durdur") : t("Sürdür")}
              </button>
              <button type="button" disabled={mesgul} onClick={onSil} style={{ ...ikincilDugme, color: c.danger }}>
                {t("Sil")}
              </button>
            </>
          )}
        </div>
      </div>
      {liste.length === 0 ? (
        <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Bu listede gönderi yok.")}</span>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
          {liste.slice(0, 12).map((g) => {
            const link = safeExternalUrl(g.permalink);
            return (
              <a
                key={g.externalMediaId}
                href={link ?? undefined}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  textDecoration: "none",
                  background: c.background,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: c.textPrimary,
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {g.caption || t("(açıklama yok)")}
                </span>
                <span style={{ fontSize: 11, color: c.textSecondary }}>
                  ♥ {kisaSayi(g.likeCount)} · 💬 {kisaSayi(g.commentsCount)} · {tarih(g.postedAt)}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
