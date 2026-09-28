import { useState } from "react";
import { adminYeniKullaniciDogrula, kullaniciAdiOner, type Locale, type ThemeColors } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { adminKullanicilar } from "../api/adminKullanicilar";
import { useT } from "../lib/i18n";
import Modal from "./Modal";

/**
 * Admin > Kullanıcılar > "Kullanıcı ekle": birini sisteme kaydeder.
 *
 * Kişi ilk girişte kendi şifresini belirlemek ZORUNDA (sunucu her zaman
 * işaretliyor) — burada o yüzden "zorunlu olsun mu" seçeneği yok. Geçici
 * şifre boş bırakılabilir: o zaman kişi yalnızca e-postadaki tek kullanımlık
 * bağlantıyla girer. Doğrulama sunucuyla aynı ortak fonksiyondan geçer
 * (adminYeniKullaniciDogrula).
 */
export default function AdminYeniKullaniciModal({
  onClose,
  onAcildi,
}: {
  onClose: () => void;
  /** Hesap açıldı; liste yenilensin ve istenirse detay açılsın. */
  onAcildi: (userId: string) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  // Kullanıcı adına elle dokunulana kadar addan önerilir; dokunulduktan sonra
  // ad değişince yöneticinin yazdığını ezmemeli.
  const [usernameElle, setUsernameElle] = useState(false);
  const [password, setPassword] = useState("");
  const [baglanti, setBaglanti] = useState(true);
  const [locale, setLocale] = useState<Locale>("tr");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<{ userId: string; epostaGonderildi: boolean } | null>(null);

  const girdi = { fullName, email, username, password, girisBaglantisiGonder: baglanti, locale };
  const dogrulama = adminYeniKullaniciDogrula(girdi);

  const adDegisti = (deger: string) => {
    setFullName(deger);
    if (!usernameElle) setUsername(kullaniciAdiOner(deger));
  };

  const kaydet = async () => {
    if ("hata" in dogrulama) {
      setHata(t(dogrulama.hata));
      return;
    }
    setKaydediliyor(true);
    setHata(null);
    try {
      setSonuc(await adminKullanicilar.hesapAc(dogrulama.temiz));
    } catch (err: any) {
      setHata(err?.message ?? t("Hesap açılamadı."));
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <Modal title={t("Kullanıcı ekle")} onClose={onClose} maxWidth={520} mobileFullScreen>
      {sonuc ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14.5, color: c.textPrimary, lineHeight: 1.55 }}>
          <p style={{ margin: 0, color: c.success, fontWeight: 600 }}>{t("Hesap açıldı.")}</p>
          {baglanti && sonuc.epostaGonderildi && (
            <p style={{ margin: 0 }}>{t("{eposta} adresine giriş bağlantısı gönderildi. Kişi bağlantıya tıklayınca kendi şifresini belirleyecek.", { eposta: email.trim() })}</p>
          )}
          {baglanti && !sonuc.epostaGonderildi && (
            <p style={{ margin: 0, color: c.danger }}>
              {t("Giriş bağlantısı e-postası gönderilemedi. Kullanıcının detayından yeniden gönderebilirsin; sunucuda RESEND_API_KEY ve EMAIL_FROM ayarlarını da kontrol et.")}
            </p>
          )}
          {password && (
            <p style={{ margin: 0 }}>
              {t("Geçici şifreyi kişiye kendin ilet. İlk girişte kendi şifresini belirlemesi istenecek.")}
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={dugme(c, "ikincil")}>
              {t("Kapat")}
            </button>
            <button type="button" onClick={() => onAcildi(sonuc.userId)} style={dugme(c, "birincil")}>
              {t("Kullanıcıyı aç")}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13.5, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
            {t("Kişi ilk girişte kendi şifresini belirler, ardından hesap tipini seçip kurulumu kendisi tamamlar.")}
          </p>

          <label>
            <div style={etiketStili(c)}>{t("Ad soyad")}</div>
            <input autoFocus value={fullName} maxLength={120} onChange={(e) => adDegisti(e.target.value)} style={alanStili(c)} />
          </label>

          <label>
            <div style={etiketStili(c)}>{t("E-posta")}</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" style={alanStili(c)} />
          </label>

          <label>
            <div style={etiketStili(c)}>{t("Kullanıcı adı")}</div>
            <input
              value={username}
              maxLength={30}
              onChange={(e) => {
                setUsernameElle(true);
                setUsername(e.target.value);
              }}
              autoComplete="off"
              style={alanStili(c)}
            />
          </label>

          <label>
            <div style={etiketStili(c)}>{t("Geçici şifre (isteğe bağlı)")}</div>
            <input
              type="text"
              value={password}
              maxLength={72}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={t("Boş bırakırsan kişi yalnızca e-postadaki bağlantıyla girer")}
              style={alanStili(c)}
            />
          </label>

          <label>
            <div style={etiketStili(c)}>{t("E-posta dili")}</div>
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} style={alanStili(c)}>
              <option value="tr">{t("Türkçe")}</option>
              <option value="en">{t("İngilizce")}</option>
            </select>
          </label>

          <label style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, fontSize: 14.5, color: c.textPrimary, cursor: "pointer", lineHeight: 1.45 }}>
            <input type="checkbox" checked={baglanti} onChange={(e) => setBaglanti(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              {t("Giriş bağlantısını e-postayla gönder")}
              <span style={{ display: "block", fontSize: 12.5, color: c.textSecondary }}>
                {t("7 gün geçerli, tek kullanımlık. Şifre e-postaya yazılmaz.")}
              </span>
            </span>
          </label>

          {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} style={dugme(c, "ikincil")}>
              {t("Vazgeç")}
            </button>
            <button
              type="button"
              onClick={kaydet}
              disabled={kaydediliyor || "hata" in dogrulama}
              title={"hata" in dogrulama ? t(dogrulama.hata) : undefined}
              style={{ ...dugme(c, "birincil"), opacity: kaydediliyor || "hata" in dogrulama ? 0.55 : 1 }}
            >
              {kaydediliyor ? t("Açılıyor…") : t("Hesabı aç")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function etiketStili(c: ThemeColors): React.CSSProperties {
  return { fontSize: 13, color: c.textSecondary, marginBottom: 5 };
}

function alanStili(c: ThemeColors): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 11px",
    borderRadius: 9,
    border: `1px solid ${c.border}`,
    fontSize: 14.5,
    color: c.textPrimary,
    background: c.background,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}

function dugme(c: ThemeColors, tur: "birincil" | "ikincil"): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 9,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${tur === "birincil" ? c.accent : c.border}`,
    background: tur === "birincil" ? c.accent : c.surface,
    color: tur === "birincil" ? c.onPrimary : c.textPrimary,
  };
}
