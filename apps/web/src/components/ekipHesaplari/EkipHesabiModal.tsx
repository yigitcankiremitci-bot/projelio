import { useEffect, useRef, useState } from "react";
import type { EkipHesabi, EkipHesabiGirdisi, EkipHesabiSecenekleri } from "@projelio/shared";
import { KULLANICI_ADI_DESENI, kullaniciAdiOner } from "@projelio/shared";
import { ekipHesaplariApi } from "../../api/ekipHesaplari";
import { useT } from "../../lib/i18n";
import { sifreUret } from "../../lib/ekipHesaplari";
import { useThemeColors } from "../../theme/useThemeColors";
import Modal from "../Modal";
import KadroSecimi, { DepartmanRolleri, GOREV_ONERILERI, baslangicDepartmanlari, kadroSeciminiTopla } from "./KadroSecimi";

interface Props {
  organizationId: string;
  secenekler: EkipHesabiSecenekleri;
  onClose: () => void;
  /** Açılan hesap + şifre (bir kez gösterilsin diye) + e-posta gitti mi. */
  onAcildi: (sonuc: { hesap: EkipHesabi; sifre: string; epostaGonderildi: boolean }) => void;
}

/**
 * Ekip hesabı açma formu.
 *
 * Kullanıcı adı ad soyaddan KENDİLİĞİNDEN önerilir ve yönetici elle
 * değiştirene kadar adı izler; değiştirdikten sonra dokunulmaz (yazdığını
 * ezmek can sıkıcı olurdu).
 *
 * ŞİFRE VARSAYILAN OLARAK ÜRETİLİR: yöneticinin aklına gelen ilk şifre
 * genelde "12345678" ya da şirket adı oluyor. Değiştirilebilir.
 *
 * Departman/rol ve modül seçimi İşe al formuyla ortak (bkz. KadroSecimi).
 */
export default function EkipHesabiModal({ organizationId, secenekler, onClose, onAcildi }: Props) {
  const c = useThemeColors();
  const t = useT();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [kullaniciAdiElle, setKullaniciAdiElle] = useState(false);
  const [kullaniciAdiUygun, setKullaniciAdiUygun] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [password, setPassword] = useState(() => sifreUret());
  const [sifreGorunur, setSifreGorunur] = useState(true);
  const [sifreDegistirmeli, setSifreDegistirmeli] = useState(true);
  const [locale, setLocale] = useState<"tr" | "en">("tr");
  const [karsilamaNotu, setKarsilamaNotu] = useState("");
  // Departman → rol. Tek departmanlı şirkette baştan seçili gelir.
  const [departmanlar, setDepartmanlar] = useState<DepartmanRolleri>(() => baslangicDepartmanlari(secenekler));
  // "departmentId:moduleKey"
  const [moduller, setModuller] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!kullaniciAdiElle) setUsername(kullaniciAdiOner(fullName));
  }, [fullName, kullaniciAdiElle]);

  // Kullanıcı adı müsait mi — yazmayı bitirince bir kez sorulur.
  const sonSorgu = useRef(0);
  useEffect(() => {
    setKullaniciAdiUygun(null);
    const ad = username.trim().replace(/^@/, "").toLowerCase();
    if (!KULLANICI_ADI_DESENI.test(ad)) return;
    const no = ++sonSorgu.current;
    const zamanlayici = setTimeout(() => {
      ekipHesaplariApi
        .kullaniciAdiUygun(organizationId, ad)
        .then((r) => {
          if (no === sonSorgu.current) setKullaniciAdiUygun(r.uygun);
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(zamanlayici);
  }, [username, organizationId]);

  const kaydet = async () => {
    setError("");
    if (!fullName.trim()) return setError(t("Ad soyad gerekli"));
    if (!KULLANICI_ADI_DESENI.test(username.trim().replace(/^@/, "").toLowerCase())) {
      return setError(t("Kullanıcı adı 3-30 karakter olmalı; sadece küçük harf, rakam, nokta ve alt çizgi içerebilir."));
    }
    if (!email.trim()) return setError(t("E-posta gerekli"));
    if (password.length < 8) return setError(t("Şifre en az 8 karakter olmalı."));
    const kadro = kadroSeciminiTopla(secenekler, departmanlar, moduller);
    if (kadro.departmanlar.length === 0) return setError(t("En az bir departman seç."));

    const govde: EkipHesabiGirdisi = {
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
      title: title.trim() || undefined,
      phone: phone.trim() || undefined,
      ...kadro,
      sifreDegistirmeli,
      karsilamaNotu: karsilamaNotu.trim() || undefined,
      locale,
    };

    setBusy(true);
    try {
      const sonuc = await ekipHesaplariApi.olustur(organizationId, govde);
      onAcildi({ ...sonuc, sifre: password });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Hesap açılamadı"));
    } finally {
      setBusy(false);
    }
  };

  const etiket = (metin: string) => <label style={{ fontSize: 12, color: c.textSecondary }}>{metin}</label>;
  const ipucu = (metin: string) => <span style={{ fontSize: 11, color: c.textSecondary }}>{metin}</span>;
  const alan = { fontSize: 13, padding: "6px 8px", width: "100%", boxSizing: "border-box" as const } as const;
  const satir = { display: "flex", gap: 8, flexWrap: "wrap" as const };
  const kutu = { flex: "1 1 180px", display: "flex", flexDirection: "column" as const, gap: 4, minWidth: 0 };
  const bolum = (baslik: string) => (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        color: c.textPrimary,
        marginTop: 6,
        paddingBottom: 4,
        borderBottom: `1px solid ${c.border}`,
      }}
    >
      {baslik}
    </div>
  );
  const kucukDugme = {
    fontSize: 12,
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "5px 10px",
    cursor: "pointer",
    color: c.textSecondary,
    whiteSpace: "nowrap" as const,
  };

  return (
    <Modal
      title={t("Ekip hesabı aç")}
      subtitle={t("Hesap, kadro kaydı ve modül yetkileri birlikte açılır; kişiye hesabına doğrudan girebileceği bir bağlantı gider.")}
      onClose={onClose}
      maxWidth={680}
      mobileFullScreen
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
          {error && <span style={{ fontSize: 12, color: c.danger, marginRight: "auto" }}>{error}</span>}
          <button onClick={onClose} style={{ ...kucukDugme, fontSize: 13, padding: "6px 14px" }}>
            {t("Vazgeç")}
          </button>
          <button
            data-primary
            onClick={kaydet}
            disabled={busy}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              background: c.primary,
              color: c.onPrimary,
              border: "none",
              borderRadius: 8,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? t("Açılıyor…") : t("Hesabı aç ve e-postayı gönder")}
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* ------------------------------------------------------------ Kişi */}
        {bolum(t("Kişi"))}
        <div style={satir}>
          <div style={kutu}>
            {etiket(t("Ad soyad *"))}
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus style={alan} />
          </div>
          <div style={kutu}>
            {etiket(t("Kullanıcı adı *"))}
            <input
              value={username}
              onChange={(e) => {
                setKullaniciAdiElle(true);
                setUsername(e.target.value.toLowerCase().replace(/\s/g, ""));
              }}
              placeholder="ayse.yilmaz"
              style={alan}
            />
            {kullaniciAdiUygun === false && (
              <span style={{ fontSize: 11, color: c.danger }}>{t("Bu kullanıcı adı alınmış.")}</span>
            )}
            {kullaniciAdiUygun === true && (
              <span style={{ fontSize: 11, color: c.success }}>{t("Kullanılabilir.")}</span>
            )}
          </div>
        </div>
        <div style={satir}>
          <div style={kutu}>
            {etiket(t("E-posta *"))}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ayse@sirket.com" style={alan} />
            {ipucu(t("Giriş bağlantısı bu adrese gider; kişi bu adresle giriş yapar."))}
          </div>
          <div style={kutu}>
            {etiket(t("Telefon"))}
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={alan} />
          </div>
        </div>

        {/* ------------------------------------------------------------ Görev */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {etiket(t("Görevi"))}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            list="ekip-hesabi-gorevler"
            placeholder={t("Satış temsilcisi")}
            style={alan}
          />
          <datalist id="ekip-hesabi-gorevler">
            {GOREV_ONERILERI.map((g) => (
              <option key={g} value={t(g)} />
            ))}
          </datalist>
          {ipucu(t("Kadroda ve profilinde unvan olarak görünür; yetkiyi değiştirmez."))}
        </div>

        {/* ------------------------------------------------------------ Giriş */}
        {bolum(t("Giriş bilgileri"))}
        <div style={satir}>
          <div style={{ ...kutu, flex: "2 1 240px" }}>
            {etiket(t("Şifre *"))}
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type={sifreGorunur ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                style={{ ...alan, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
              <button type="button" onClick={() => setSifreGorunur((g) => !g)} style={kucukDugme}>
                {sifreGorunur ? t("Gizle") : t("Göster")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPassword(sifreUret());
                  setSifreGorunur(true);
                }}
                style={kucukDugme}
              >
                {t("Yeni üret")}
              </button>
            </div>
            {ipucu(t("Şifre e-postada YAZMAZ. Kişi bağlantıyla girer; şifreyi gerekirse sen iletirsin."))}
          </div>
          <div style={{ ...kutu, flex: "1 1 140px" }}>
            {etiket(t("E-posta dili"))}
            <select value={locale} onChange={(e) => setLocale(e.target.value as "tr" | "en")} style={alan}>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.textPrimary }}>
          <input type="checkbox" checked={sifreDegistirmeli} onChange={(e) => setSifreDegistirmeli(e.target.checked)} />
          {t("İlk girişte kendi şifresini belirlesin (önerilir)")}
        </label>

        <KadroSecimi
          secenekler={secenekler}
          departmanlar={departmanlar}
          setDepartmanlar={setDepartmanlar}
          moduller={moduller}
          setModuller={setModuller}
          bolum={bolum}
        />

        {/* ------------------------------------------------------------ Not */}
        {bolum(t("Karşılama notu"))}
        <textarea
          value={karsilamaNotu}
          onChange={(e) => setKarsilamaNotu(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={t("Aramıza hoş geldin! Pazartesi 09:00'da tanışma toplantımız var.")}
          style={{ ...alan, resize: "vertical" }}
        />
        {ipucu(t("İsteğe bağlı; e-postada senin adınla görünür."))}
      </div>
    </Modal>
  );
}
