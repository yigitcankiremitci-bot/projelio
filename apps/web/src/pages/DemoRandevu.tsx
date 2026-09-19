import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { DEMO_EKIP_BUYUKLUKLERI, type DemoMusaitlik, type DemoRandevuGorunumu, type User } from "@projelio/shared";
import { API_URL } from "../api/client";
import { demoRandevuApi } from "../api/demoRandevu";
import { useLocale, useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import SlotSecici from "../components/demoRandevu/SlotSecici";
import TakvimeEkle from "../components/demoRandevu/TakvimeEkle";
import { uzunTarih } from "../components/demoRandevu/demoBicim";
import OzetKutusu from "../components/demoRandevu/OzetKutusu";
import { anaDugme, girdi, ikincilDugme } from "../components/demoRandevu/stiller";

/**
 * Canlı demo randevusu — ÜYELİK GEREKTİRMEZ.
 *
 * İki adres, tek sayfa:
 *   /demo-randevu         → blok seç, bilgilerini bırak, randevu al
 *   /demo-randevu/:token  → e-postadaki yönetim bağlantısı: görüntüle, saati
 *                           değiştir, iptal et (?takvim=ics → .ics indirilir)
 *
 * Uygulama kabuğu (kenar çubuğu, Lio) kurulmaz — App.tsx'teki isAuthScreen
 * listesinde (PublicFileDownload ile aynı desen). Giriş yapmış bir üye bu
 * sayfaya gelirse iletişim alanları sorulmaz, randevu hesabına bağlanır.
 */
export default function DemoRandevu() {
  const { token } = useParams();
  const c = useThemeColors();
  const t = useT();

  useEffect(() => {
    document.title = `${t("Canlı demo")} · Projelio`;
  }, [t]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: c.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 16px",
        gap: 18,
      }}
    >
      <div style={{ width: "100%", maxWidth: 620 }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.4, color: c.accent, textTransform: "uppercase" }}>Projelio</div>
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 16,
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        {token ? <Yonetim token={token} /> : <RandevuAl />}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: c.textSecondary, textAlign: "center", maxWidth: 520, lineHeight: 1.6 }}>
        {t("Sorun mu yaşıyorsun? destek@projelio.app adresine yazabilirsin.")}
      </p>
    </div>
  );
}

// ───────────────────────────────────────────── Randevu al

/**
 * Oturum var mı — api istemcisinden GEÇMEDEN.
 *
 * Bu sayfaya çoğunlukla hesabı olmayan ya da çoktan çıkış yapmış biri geliyor.
 * Tarayıcıda bayat bir token kalmışsa api istemcisi 401'i "oturum düştü" sayıp
 * ziyaretçiyi giriş ekranına atardı (client.ts'teki merkezi davranış, orada
 * kalmalı). Burada 401 yalnızca "ziyaretçi" demek.
 */
async function oturumuSessizceOku(): Promise<User | null> {
  const token = localStorage.getItem("projelio_token");
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? ((await res.json()) as User) : null;
  } catch {
    return null;
  }
}

function RandevuAl() {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const [musaitlik, setMusaitlik] = useState<DemoMusaitlik | null>(null);
  const [yukHata, setYukHata] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  const [mevcut, setMevcut] = useState<DemoRandevuGorunumu | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [form, setForm] = useState({ ad: "", eposta: "", telefon: "", sirket: "", ekipBuyuklugu: "", not: "", website: "" });
  const [kvkk, setKvkk] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState("");
  const [sonuc, setSonuc] = useState<DemoRandevuGorunumu | "tamam" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const yukle = () =>
    demoRandevuApi
      .musaitlik()
      .then(setMusaitlik)
      .catch(() => setYukHata(true));

  useEffect(() => {
    void yukle();
    // Giriş yapmış üye: bilgileri hesabından gelir, yaklaşan randevusu varsa
    // yenisi yerine o gösterilir. Oturum yoksa ya da düşmüşse sessizce
    // ziyaretçi akışına kalınır.
    void oturumuSessizceOku().then((u) => {
      // Herkese açık demo hesabı (role "demo") üye sayılmaz: o hesabı herkes
      // kullanıyor, randevu ona bağlanırsa kimin olduğu belli olmaz.
      if (!u || u.role === "demo") return;
      setMe(u);
      demoRandevuApi
        .benim()
        .then((b) => setMevcut(b.randevu))
        .catch(() => undefined);
    });
  }, []);

  const sec = (baslangic: string) => {
    setSecili(baslangic);
    setHata("");
    // Telefonda form bloğun altında kalıyor; seçimden sonra oraya kaydır.
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const gonder = async (e: FormEvent) => {
    e.preventDefault();
    if (!secili) return;
    setHata("");
    setGonderiliyor(true);
    try {
      const girdi = { ...form, baslangic: secili, kvkkOnay: kvkk, dil: locale };
      const r = me ? await demoRandevuApi.uyeAl(girdi) : await demoRandevuApi.al(girdi);
      setSonuc("id" in r ? r : "tamam");
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Randevu alınamadı. Birkaç dakika sonra tekrar dene."));
      // Blok dolmuşsa listeyi tazele: aynı bloğu yeniden seçmeye çalışmasın.
      setSecili(null);
      void yukle();
    } finally {
      setGonderiliyor(false);
    }
  };

  if (sonuc) return <Basarili randevu={sonuc === "tamam" ? null : sonuc} />;
  if (mevcut) return <Mevcut randevu={mevcut} />;
  if (yukHata) return <p style={{ margin: 0, color: c.textSecondary }}>{t("Takvim şu anda açılamadı. Birkaç dakika sonra tekrar dene.")}</p>;
  if (!musaitlik) return <p style={{ margin: 0, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600, color: c.textPrimary }}>{t("Projelio'yu canlı öğren")}</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: c.textSecondary }}>
          {t("Ekibimizden biriyle 40 dakikalık online görüşmede Projelio'yu kendi işine göre birlikte kuralım. Ücretsiz; sana uyan saati seç.")}
        </p>
      </div>

      {!musaitlik.aktif ? (
        <p style={{ margin: 0, fontSize: 15, color: c.textSecondary, lineHeight: 1.6 }}>
          {t("Demo randevuları şu an kapalı. Kısa süre sonra yeniden açılacak.")}
        </p>
      ) : (
        <>
          <Bolum baslik={t("1. Saat seç")}>
            <SlotSecici musaitlik={musaitlik} secili={secili} onSec={sec} />
          </Bolum>

          {secili && (
            <form ref={formRef} onSubmit={gonder} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Bolum baslik={t("2. Bilgilerin")}>
                <div style={{ fontSize: 14, color: c.textPrimary, fontWeight: 500, marginBottom: 4 }}>
                  {uzunTarih(secili, new Date(Date.parse(secili) + musaitlik.sureDk * 60_000).toISOString(), musaitlik.saatDilimi, locale)}
                </div>
                {me ? (
                  <p style={{ margin: 0, fontSize: 14, color: c.textSecondary, lineHeight: 1.6 }}>
                    {t("Randevu hesabındaki bilgilerle alınacak: {eposta}", { eposta: me.email })}
                  </p>
                ) : (
                  <>
                    <Alan etiket={t("Ad soyad")}>
                      <input required value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} style={girdi(c)} autoComplete="name" />
                    </Alan>
                    <Alan etiket={t("E-posta")}>
                      <input required type="email" value={form.eposta} onChange={(e) => setForm({ ...form, eposta: e.target.value })} style={girdi(c)} autoComplete="email" />
                    </Alan>
                    <Alan etiket={t("Telefon")}>
                      <input required type="tel" value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} style={girdi(c)} autoComplete="tel" placeholder="+90 5xx xxx xx xx" />
                    </Alan>
                    <Alan etiket={t("Şirket (isteğe bağlı)")}>
                      <input value={form.sirket} onChange={(e) => setForm({ ...form, sirket: e.target.value })} style={girdi(c)} autoComplete="organization" />
                    </Alan>
                  </>
                )}
                <Alan etiket={t("Ekip büyüklüğü (isteğe bağlı)")}>
                  <select value={form.ekipBuyuklugu} onChange={(e) => setForm({ ...form, ekipBuyuklugu: e.target.value })} style={girdi(c)}>
                    <option value="">—</option>
                    {DEMO_EKIP_BUYUKLUKLERI.map((b) => (
                      <option key={b} value={b}>
                        {t(b)}
                      </option>
                    ))}
                  </select>
                </Alan>
                <Alan etiket={t("Özellikle neyi görmek istersin? (isteğe bağlı)")}>
                  <textarea
                    value={form.not}
                    onChange={(e) => setForm({ ...form, not: e.target.value })}
                    rows={3}
                    maxLength={1000}
                    style={{ ...girdi(c), resize: "vertical", fontFamily: "inherit" }}
                    placeholder={t("Ör. ekibimle görev dağıtımı, bütçe takibi, sosyal medya takvimi")}
                  />
                </Alan>
                {/* Bot tuzağı: ekran okuyucudan ve sekme sırasından da gizli. */}
                <input
                  tabIndex={-1}
                  aria-hidden="true"
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
                />
                {!me && (
                  <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
                    <input type="checkbox" required checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} style={{ marginTop: 2 }} />
                    <span>
                      {t("Bilgilerimin yalnızca bu görüşmeyi planlamak için işlenmesini kabul ediyorum.")}{" "}
                      <Link to="/kvkk" target="_blank" style={{ color: c.primary }}>
                        {t("Aydınlatma metni")}
                      </Link>
                    </span>
                  </label>
                )}
              </Bolum>
              {hata && <p style={{ margin: 0, fontSize: 14, color: c.danger }}>{hata}</p>}
              <button type="submit" disabled={gonderiliyor} style={anaDugme(c)}>
                {gonderiliyor ? t("Gönderiliyor…") : t("Randevuyu onayla")}
              </button>
            </form>
          )}
          {!secili && hata && <p style={{ margin: 0, fontSize: 14, color: c.danger }}>{hata}</p>}
        </>
      )}

      {!me && (
        <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>
          {t("Zaten üye misin?")}{" "}
          <Link to="/login" style={{ color: c.primary }}>
            {t("Giriş yap")}
          </Link>{" "}
          {t("— randevu hesabına bağlanır.")}
        </p>
      )}
    </div>
  );
}

function Basarili({ randevu }: { randevu: DemoRandevuGorunumu | null }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: c.textPrimary }}>{t("Randevun alındı")}</h1>
      {randevu && (
        <>
          <OzetKutusu randevu={randevu} />
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: c.textSecondary }}>
            {t("Onay e-postası {eposta} adresine gitti. Seni karşılayacak ekip arkadaşımızı atadığımızda görüşme bağlantısını da göndereceğiz.", {
              eposta: randevu.eposta,
            })}
          </p>
          <TakvimeEkle randevu={randevu} />
          <p style={{ margin: 0, fontSize: 12, color: c.textSecondary }}>
            {t("Apple Takvim dosyası 1 gün ve 1 saat önce iki hatırlatma kurar.")}
          </p>
          {randevu.hesapGerekli && (
            <HesapCagrisi eposta={randevu.eposta} />
          )}
          <Link to={`/demo-randevu/${randevu.yonetimToken}`} style={{ fontSize: 14, color: c.primary }}>
            {t("Randevuyu değiştir ya da iptal et")}
          </Link>
        </>
      )}
      {!randevu && (
        <p style={{ margin: 0, fontSize: 14, color: c.textSecondary }}>
          {t("Onay e-postası birkaç dakika içinde gelecek.")}
        </p>
      )}
    </div>
  );
}

function Mevcut({ randevu }: { randevu: DemoRandevuGorunumu }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: c.textPrimary }}>{t("Yaklaşan bir randevun var")}</h1>
      <OzetKutusu randevu={randevu} />
      <TakvimeEkle randevu={randevu} />
      <Link to={`/demo-randevu/${randevu.yonetimToken}`} style={{ fontSize: 14, color: c.primary }}>
        {t("Randevuyu değiştir ya da iptal et")}
      </Link>
    </div>
  );
}

// ───────────────────────────────────────────── Yönetim bağlantısı

function Yonetim({ token }: { token: string }) {
  const c = useThemeColors();
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const [randevu, setRandevu] = useState<DemoRandevuGorunumu | null>(null);
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "yok">("yukleniyor");
  const [mod, setMod] = useState<"bak" | "tasi" | "iptal">("bak");
  const [musaitlik, setMusaitlik] = useState<DemoMusaitlik | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [neden, setNeden] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");

  useEffect(() => {
    // E-postadaki "Apple Takvim'e ekle" buraya ?takvim=ics ile geliyor: API'nin
    // dış adresi her kurulumda tanımlı olmadığı için .ics'e buradan gidiliyor.
    if (searchParams.get("takvim") === "ics") {
      const sonraki = new URLSearchParams(searchParams);
      sonraki.delete("takvim");
      setSearchParams(sonraki, { replace: true });
      window.location.href = demoRandevuApi.icsUrl(token);
    }
    demoRandevuApi
      .gorunum(token)
      .then((r) => {
        setRandevu(r);
        setDurum("hazir");
      })
      .catch(() => setDurum("yok"));
    // eslint yok; token değişmeden yeniden çalışmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const tasimaAc = async () => {
    setMod("tasi");
    setHata("");
    setSecili(null);
    try {
      setMusaitlik(await demoRandevuApi.tasimaMusaitligi(token));
    } catch {
      setHata(t("Takvim şu anda açılamadı. Birkaç dakika sonra tekrar dene."));
    }
  };

  const tasi = async () => {
    if (!secili) return;
    setCalisiyor(true);
    setHata("");
    try {
      setRandevu(await demoRandevuApi.tasi(token, secili));
      setMod("bak");
      setBilgi(t("Yeni saat kaydedildi. Güncel bilgiler e-postana gönderildi."));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi."));
      setMusaitlik(await demoRandevuApi.tasimaMusaitligi(token).catch(() => musaitlik));
      setSecili(null);
    } finally {
      setCalisiyor(false);
    }
  };

  const iptal = async () => {
    setCalisiyor(true);
    setHata("");
    try {
      setRandevu(await demoRandevuApi.iptal(token, neden.trim() || undefined));
      setMod("bak");
      setBilgi("");
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İptal edilemedi."));
    } finally {
      setCalisiyor(false);
    }
  };

  if (durum === "yukleniyor") return <p style={{ margin: 0, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;
  if (durum === "yok" || !randevu) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: c.textPrimary }}>{t("Randevu bulunamadı")}</h1>
        <p style={{ margin: 0, fontSize: 15, color: c.textSecondary, lineHeight: 1.6 }}>
          {t("Bağlantı eksik kopyalanmış olabilir. E-postandaki bağlantıyı yeniden açmayı dene.")}
        </p>
        <Link to="/demo-randevu" style={{ fontSize: 14, color: c.primary }}>
          {t("Yeni randevu al")}
        </Link>
      </div>
    );
  }

  const etkin = randevu.durum === "bekliyor" || randevu.durum === "planlandi";
  const gecmis = Date.parse(randevu.bitis) < Date.now();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: c.textPrimary }}>
        {randevu.durum === "iptal" ? t("Randevu iptal edildi") : gecmis ? t("Görüşme tamamlandı") : t("Demo randevun")}
      </h1>
      <OzetKutusu randevu={randevu} />
      {bilgi && <p style={{ margin: 0, fontSize: 14, color: c.success }}>{bilgi}</p>}

      {randevu.durum === "iptal" && (
        <Link to="/demo-randevu" style={{ ...anaDugme(c), textAlign: "center", textDecoration: "none" }}>
          {t("Yeni saat seç")}
        </Link>
      )}

      {etkin && !gecmis && mod === "bak" && (
        <>
          {randevu.toplantiLinki && (
            <a href={randevu.toplantiLinki} target="_blank" rel="noopener noreferrer" style={{ ...anaDugme(c), textAlign: "center", textDecoration: "none" }}>
              {t("Görüşmeye katıl")}
            </a>
          )}
          <TakvimeEkle randevu={randevu} />
          {randevu.hesapGerekli && <HesapCagrisi eposta={randevu.eposta} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void tasimaAc()} style={ikincilDugme(c)}>
              {t("Saati değiştir")}
            </button>
            <button type="button" onClick={() => setMod("iptal")} style={{ ...ikincilDugme(c), color: c.danger }}>
              {t("İptal et")}
            </button>
          </div>
        </>
      )}

      {mod === "tasi" && (
        <Bolum baslik={t("Yeni saat seç")}>
          {musaitlik ? (
            <SlotSecici musaitlik={musaitlik} secili={secili} onSec={setSecili} />
          ) : (
            !hata && <p style={{ margin: 0, color: c.textSecondary }}>{t("Yükleniyor…")}</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <button type="button" disabled={!secili || calisiyor} onClick={() => void tasi()} style={anaDugme(c)}>
              {calisiyor ? t("Kaydediliyor…") : t("Bu saate taşı")}
            </button>
            <button type="button" onClick={() => setMod("bak")} style={ikincilDugme(c)}>
              {t("Vazgeç")}
            </button>
          </div>
        </Bolum>
      )}

      {mod === "iptal" && (
        <Bolum baslik={t("Randevuyu iptal et")}>
          <textarea
            value={neden}
            onChange={(e) => setNeden(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t("İstersen nedenini yaz (isteğe bağlı)")}
            style={{ ...girdi(c), resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={calisiyor} onClick={() => void iptal()} style={{ ...anaDugme(c), background: c.danger }}>
              {calisiyor ? t("İptal ediliyor…") : t("Evet, iptal et")}
            </button>
            <button type="button" onClick={() => setMod("bak")} style={ikincilDugme(c)}>
              {t("Vazgeç")}
            </button>
          </div>
        </Bolum>
      )}

      {hata && <p style={{ margin: 0, fontSize: 14, color: c.danger }}>{hata}</p>}
    </div>
  );
}

// ───────────────────────────────────────────── Parçalar

function HesapCagrisi({ eposta }: { eposta: string }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div style={{ padding: "12px 14px", background: c.background, borderRadius: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <strong style={{ fontSize: 14, color: c.textPrimary }}>{t("Görüşmeden önce hesabını oluştur")}</strong>
      <span style={{ fontSize: 14, color: c.textSecondary, lineHeight: 1.6 }}>
        {t("Demoda kendi hesabında birlikte ilerleyeceğiz. Ücretsiz hesabını bu e-posta adresiyle şimdiden açarsan görüşmenin tamamı sana ayrılır.")}
      </span>
      <Link to={`/register?email=${encodeURIComponent(eposta)}`} style={{ ...anaDugme(c), alignSelf: "flex-start", textDecoration: "none" }}>
        {t("Hesabımı oluştur")}
      </Link>
    </div>
  );
}

function Bolum({ baslik, children }: { baslik: string; children: ReactNode }) {
  const c = useThemeColors();
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: c.textSecondary }}>{baslik}</h2>
      {children}
    </section>
  );
}

function Alan({ etiket, children }: { etiket: string; children: ReactNode }) {
  const c = useThemeColors();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 13, color: c.textSecondary }}>{etiket}</span>
      {children}
    </label>
  );
}
