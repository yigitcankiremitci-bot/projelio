import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DEMO_DURUM_ETIKETI, type DemoMeetDurumu, type DemoMusaitlik, type DemoRandevuGorunumu, type DemoRandevuYonetici } from "@projelio/shared";
import { demoRandevuApi } from "../../api/demoRandevu";
import { useThemeColors } from "../../theme/useThemeColors";
import { useLocale, useT } from "../../lib/i18n";
import Modal from "../Modal";
import SlotSecici from "./SlotSecici";
import TakvimeEkle from "./TakvimeEkle";
import OzetKutusu from "./OzetKutusu";
import { uzunTarih } from "./demoBicim";
import { anaDugme, girdi, ikincilDugme } from "./stiller";

/**
 * Ayarlar > Yardımcılar'daki "Canlı demo" kartının içi.
 *
 * Üye bilgilerini yazmaz: ad, e-posta ve telefon hesabından gelir. Yaklaşan
 * randevusu varsa kart onu gösterir; değiştirme ve iptal e-postadaki
 * bağlantıyla AYNI sayfada (/demo-randevu/:token) — kural tek yerde.
 *
 * Kişi demo SUNUCUSUYSA (moderatör ya da yönetici) altında kendisine atanan
 * görüşmeler listelenir: sonucu buradan işaretler.
 */
export default function DemoRandevuKarti() {
  const c = useThemeColors();
  const t = useT();
  const [durum, setDurum] = useState<{ randevu: DemoRandevuGorunumu | null; sunucu: boolean } | undefined>(undefined);
  const [acik, setAcik] = useState(false);

  const yukle = () =>
    demoRandevuApi
      .benim()
      .then(setDurum)
      // Uç yoksa (sunucu güncellenmeden) kart "randevu al" hâlinde kalır.
      .catch(() => setDurum({ randevu: null, sunucu: false }));

  useEffect(() => {
    void yukle();
  }, []);

  if (durum === undefined) return <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {durum.randevu ? (
        <>
          <OzetKutusu randevu={durum.randevu} />
          {durum.randevu.toplantiLinki && (
            <a href={durum.randevu.toplantiLinki} target="_blank" rel="noopener noreferrer" style={{ ...anaDugme(c), alignSelf: "flex-start", textDecoration: "none" }}>
              {t("Görüşmeye katıl")}
            </a>
          )}
          <TakvimeEkle randevu={durum.randevu} />
          <Link to={`/demo-randevu/${durum.randevu.yonetimToken}`} style={{ fontSize: 14, color: c.primary }}>
            {t("Randevuyu değiştir ya da iptal et")}
          </Link>
        </>
      ) : (
        <button type="button" onClick={() => setAcik(true)} style={{ ...anaDugme(c), alignSelf: "flex-start", padding: "9px 16px", fontWeight: 500 }}>
          {t("Demo randevusu al")}
        </button>
      )}

      {durum.sunucu && <MeetBaglantisi />}
      {durum.sunucu && <Gorevlerim />}

      {acik && (
        <RandevuPenceresi
          onClose={() => setAcik(false)}
          onAlindi={(r) => {
            setDurum((d) => ({ randevu: r, sunucu: d?.sunucu ?? false }));
            setAcik(false);
          }}
        />
      )}
    </div>
  );
}

function RandevuPenceresi({ onClose, onAlindi }: { onClose: () => void; onAlindi: (r: DemoRandevuGorunumu) => void }) {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const [musaitlik, setMusaitlik] = useState<DemoMusaitlik | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [not, setNot] = useState("");
  const [telefon, setTelefon] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");

  const yukle = () =>
    demoRandevuApi
      .musaitlik()
      .then(setMusaitlik)
      .catch(() => setHata(t("Takvim şu anda açılamadı. Birkaç dakika sonra tekrar dene.")));

  useEffect(() => {
    void yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gonder = async () => {
    if (!secili) return;
    setCalisiyor(true);
    setHata("");
    try {
      onAlindi(await demoRandevuApi.uyeAl({ baslangic: secili, not, telefon: telefon.trim() || undefined, dil: locale }));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Randevu alınamadı. Birkaç dakika sonra tekrar dene."));
      setSecili(null);
      void yukle();
    } finally {
      setCalisiyor(false);
    }
  };

  return (
    <Modal
      title={t("Canlı demo randevusu")}
      subtitle={t("40 dakikalık online görüşme. Bilgilerin hesabından alınır.")}
      onClose={onClose}
      maxWidth={560}
      mobileFullScreen
      footer={
        <button type="button" disabled={!secili || calisiyor} onClick={() => void gonder()} style={{ ...anaDugme(c), width: "100%" }}>
          {calisiyor ? t("Gönderiliyor…") : t("Randevuyu onayla")}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!musaitlik ? (
          !hata && <p style={{ margin: 0, color: c.textSecondary }}>{t("Yükleniyor…")}</p>
        ) : !musaitlik.aktif ? (
          <p style={{ margin: 0, fontSize: 14, color: c.textSecondary }}>{t("Demo randevuları şu an kapalı. Kısa süre sonra yeniden açılacak.")}</p>
        ) : (
          <>
            <SlotSecici musaitlik={musaitlik} secili={secili} onSec={setSecili} />
            {secili && (
              <>
                <div style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary }}>
                  {uzunTarih(secili, new Date(Date.parse(secili) + musaitlik.sureDk * 60_000).toISOString(), musaitlik.saatDilimi, locale)}
                </div>
                <input
                  type="tel"
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                  placeholder={t("Telefon (isteğe bağlı — hesabında yoksa)")}
                  style={girdi(c)}
                />
                <textarea
                  value={not}
                  onChange={(e) => setNot(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder={t("Özellikle neyi görmek istersin? (isteğe bağlı)")}
                  style={{ ...girdi(c), resize: "vertical", fontFamily: "inherit" }}
                />
              </>
            )}
          </>
        )}
        {hata && <p style={{ margin: 0, fontSize: 14, color: c.danger }}>{hata}</p>}
      </div>
    </Modal>
  );
}

/**
 * Otomatik Google Meet — yalnızca demo sunucusunda görünür.
 *
 * Bağlıysa, bu kişiye atanan her randevu KENDİ Google takviminde bir etkinlik
 * olarak açılır ve katılımcıya o etkinliğin Meet bağlantısı gider. Bağlı
 * değilse kişisel ya da varsayılan bağlantı kullanılır (sistem durmaz).
 */
function MeetBaglantisi() {
  const c = useThemeColors();
  const t = useT();
  const [meet, setMeet] = useState<DemoMeetDurumu | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");

  useEffect(() => {
    demoRandevuApi.meetDurum().then(setMeet).catch(() => setMeet(null));
  }, []);

  if (!meet?.yapilandirildi) return null;

  const bagla = async () => {
    setCalisiyor(true);
    setHata("");
    try {
      const { url } = await demoRandevuApi.meetBaglantiAdresi();
      window.location.href = url;
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Google'a bağlanılamadı."));
      setCalisiyor(false);
    }
  };

  const kes = async () => {
    if (!window.confirm(t("Google Meet bağlantısı kesilsin mi? Yeni randevulara otomatik Meet açılmaz; mevcut bağlantılar çalışmaya devam eder."))) return;
    setCalisiyor(true);
    try {
      setMeet(await demoRandevuApi.meetKes());
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi."));
    } finally {
      setCalisiyor(false);
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary }}>{t("Otomatik Google Meet")}</div>
      {meet.bagli ? (
        <>
          <span style={{ fontSize: 14, color: c.textPrimary, lineHeight: 1.5 }}>
            {t("{eposta} ile bağlı. Sana atanan her demo Google Takvim'inde açılır ve katılımcıya ayrı bir Meet bağlantısı gider.", {
              eposta: meet.eposta ?? "",
            })}
          </span>
          <button type="button" disabled={calisiyor} onClick={() => void kes()} style={{ ...ikincilDugme(c), alignSelf: "flex-start" }}>
            {t("Bağlantıyı kes")}
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 14, color: c.textSecondary, lineHeight: 1.5 }}>
            {t("Google hesabını bağlarsan sana atanan her demo için takviminde ayrı bir Meet odası açılır; katılımcı beklemeden içeri girer.")}
          </span>
          <button type="button" disabled={calisiyor} onClick={() => void bagla()} style={{ ...anaDugme(c), alignSelf: "flex-start", padding: "9px 16px", fontWeight: 500 }}>
            {calisiyor ? t("Yönlendiriliyor…") : t("Google Meet'i bağla")}
          </button>
        </>
      )}
      {hata && <span style={{ fontSize: 13, color: c.danger }}>{hata}</span>}
    </div>
  );
}

/** Sunucuya atanan görüşmeler — yalnızca moderatör ve yöneticide görünür. */
function Gorevlerim() {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const [liste, setListe] = useState<DemoRandevuYonetici[] | null>(null);

  useEffect(() => {
    demoRandevuApi
      .gorevlerim()
      .then(setListe)
      .catch(() => setListe([]));
  }, []);

  const isaretle = async (id: string, durum: "tamamlandi" | "gelmedi") => {
    try {
      await demoRandevuApi.gorevGuncelle(id, { durum });
      setListe((l) => (l ?? []).filter((r) => r.id !== id));
    } catch {
      /* satır yerinde kalır; kullanıcı yeniden dener */
    }
  };

  if (!liste?.length) return null;
  return (
    <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary }}>{t("Sana atanan demolar")}</div>
      {liste.map((r) => {
        const bitti = Date.parse(r.bitis) < Date.now();
        return (
          <div key={r.id} style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>{uzunTarih(r.baslangic, r.bitis, r.saatDilimi, locale)}</div>
            <div style={{ fontSize: 13, color: c.textSecondary }}>
              {r.ad} · {r.eposta}
              {r.telefon ? ` · ${r.telefon}` : ""} · {t(DEMO_DURUM_ETIKETI[r.durum])}
            </div>
            {r.not && <div style={{ fontSize: 13, color: c.textPrimary, whiteSpace: "pre-wrap" }}>{r.not}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {r.toplantiLinki && !bitti && (
                <a href={r.toplantiLinki} target="_blank" rel="noopener noreferrer" style={{ ...ikincilDugme(c), textDecoration: "none" }}>
                  {t("Görüşmeye katıl")}
                </a>
              )}
              {bitti && (
                <>
                  <button type="button" onClick={() => void isaretle(r.id, "tamamlandi")} style={ikincilDugme(c)}>
                    {t("Tamamlandı")}
                  </button>
                  <button type="button" onClick={() => void isaretle(r.id, "gelmedi")} style={ikincilDugme(c)}>
                    {t("Katılmadı")}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
