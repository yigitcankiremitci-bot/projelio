import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Locale, SidebarColorKey, SidebarPatternKey, ThemeColors, User } from "@projelio/shared";
import { accentPresets, sidebarColorPresets, sidebarPatterns } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useTheme } from "../theme/ThemeProvider";
import { useCurrentUser } from "../lib/useCurrentUser";
import DeleteAccountModal from "../components/DeleteAccountModal";
import { useIsDesktop } from "../lib/useIsDesktop";
import { pageGutter } from "../lib/layout";
import { backState } from "../lib/backTarget";
import { demoHesap } from "../lib/demoHesap";
import { useLocale, useT } from "../lib/i18n";
import TabBar from "../components/TabBar";
import GoogleDriveCard from "../components/GoogleDriveCard";
import OneDriveCard from "../components/OneDriveCard";
import WhatsappCard from "../components/WhatsappCard";
import WhatsappProfileCard from "../components/WhatsappProfileCard";
import {
  IconShield,
  IconLogout,
  IconChevronRight,
  IconArchive,
  IconSparkle,
  IconUser,
  IconFile,
} from "../components/icons";
import {
  FONT_SCALE_OPTIONS,
  FONT_SCALE_LABELS,
  FONT_SCALE_VALUES,
  FontScaleOption,
  getFontScaleOption,
  setFontScaleOption,
} from "../lib/fontScale";
import HomeTargetModal from "../components/HomeTargetModal";
import EditProfileModal from "../components/EditProfileModal";
import { useHomeTarget } from "../lib/homeTarget";
import { useAppPrefs } from "../lib/appPrefs";
import { useTour } from "../lib/tour/TourContext";
import WorkRhythmSettings from "../components/plan/WorkRhythmSettings";
import SupportPanel from "../components/SupportPanel";

/**
 * AYARLAR — iki yerleşim, tek içerik.
 *
 * | Genişlik | Sekmeler | İçerik |
 * |---|---|---|
 * | masaüstü | solda dikey menü (NAV_WIDTH) | sağda tek sütun, CONTENT_MAX_WIDTH ile sınırlı |
 * | mobil    | üstte yana kaydırılan TabBar | tam genişlik |
 *
 * Ayar sayfası mobilde de masaüstünde de TEK sütundur: form satırları ve
 * anahtar/renk seçicileri geniş ekranda yan yana dizilince okunması zor,
 * hizası bozuk bir tabloya dönüşüyordu. Masaüstünde kazanılan genişlik ikinci
 * bir sütuna değil, soldaki menüye harcanır.
 *
 * Her bölüm kendi sekmesinde: eskiden "Genel" sekmesi hesap + gezinme + çalışma
 * ritmi + bağlı hesapları tek bir uzun kaydırmada topluyordu.
 */
const CONTENT_MAX_WIDTH = 560;
const NAV_WIDTH = 190;

type SettingsTab = "hesap" | "gorunum" | "gezinme" | "yardimcilar" | "ritim" | "baglantilar" | "destek";

/**
 * Sekme etiketleri modül düzeyinde, yani t() burada çağrılamaz (kanca yok).
 * Türkçe metin ANAHTAR olarak duruyor ve çeviri kullanıldığı yerde yapılıyor —
 * bkz. aşağıda TabBar'a verilen liste.
 */
const TABS: { key: SettingsTab; label: string }[] = [
  { key: "hesap", label: "Hesap" },
  { key: "gorunum", label: "Görünüm" }, // dil:anahtar
  { key: "gezinme", label: "Gezinme" },
  { key: "yardimcilar", label: "Yardımcılar" }, // dil:anahtar
  { key: "ritim", label: "Çalışma ritmi" }, // dil:anahtar
  { key: "baglantilar", label: "Bağlı hesaplar" }, // dil:anahtar
  { key: "destek", label: "Destek" },
];

const linkRowStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  background: "transparent",
  border: "none",
  textAlign: "left",
};

/** Masaüstündeki dikey menü satırı — sidebar'daki nav satırlarıyla aynı dil. */
const navItemStyle = (active: boolean, c: ThemeColors): CSSProperties => ({
  width: "100%",
  display: "flex",
  alignItems: "center",
  padding: "10px 14px",
  borderRadius: 9,
  border: "none",
  background: active ? c.surface : "transparent",
  color: active ? c.textPrimary : c.textSecondary,
  fontSize: 15,
  fontWeight: active ? 500 : 400,
  textAlign: "left",
});

const swatchBtnStyle = (active: boolean, c: ThemeColors): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 10,
  border: `1.5px solid ${active ? c.primary : c.border}`,
  background: active ? c.background : "transparent",
});

/** Sekme içindeki kartların ortak kabuğu: başlık + açıklama + gövde. */
/**
 * Dil seçenekleri. "Otomatik" ayrı bir dil değil, seçimin SİLİNMESİ: tercih
 * kaldırılınca tarayıcının diline geri dönülür (bkz. lib/i18n).
 *
 * Dil adları KENDİ dillerinde yazılı ve çeviriden geçmiyor: "Türkçe" arayüz
 * İngilizceyken de "Türkçe" olarak görünmeli, yoksa o dili arayan kullanıcı
 * listede kendi dilini tanıyamaz.
 */
const DIL_SECENEKLERI: { value: Locale | null; kisa: string; ad: string }[] = [
  { value: null, kisa: "A", ad: "Otomatik" },
  { value: "tr", kisa: "TR", ad: "Türkçe" }, // dil:atla — dil adı kendi dilinde kalır
  { value: "en", kisa: "EN", ad: "English" },
];

function SettingCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const c = useThemeColors();
  return (
    <section style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{title}</h3>
      {description && (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: "4px 0 0", lineHeight: 1.4 }}>{description}</p>
      )}
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

/** Bir sekme içinde birden fazla kartı adlandırılmış bir öbekte toplar. */
function CardGroup({ label, children }: { label: string; children: ReactNode }) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 13, fontWeight: 500, color: c.textSecondary, margin: 0 }}>{label}</h2>
      {children}
    </div>
  );
}

/** Renk/desen seçicilerin ortak düğmesi. */
function SwatchButton({
  active,
  onClick,
  label,
  swatch,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  swatch: CSSProperties;
}) {
  const c = useThemeColors();
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={swatchBtnStyle(active, c)}>
      <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, ...swatch }} />
      <span style={{ fontSize: 14, color: c.textPrimary }}>{label}</span>
    </button>
  );
}

function SwatchRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>;
}

/** Aç/kapa ayarı — WorkRhythmSettings'teki onay kutusu deseniyle aynı. */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 17, height: 17 }}
      />
      <span style={{ fontSize: 14, color: c.textPrimary }}>{checked ? t("Açık") : t("Kapalı")}</span>
    </label>
  );
}

export default function Settings() {
  const c = useThemeColors();
  const theme = useTheme();
  const t = useT();
  const { locale, setLocale, chosen } = useLocale();
  // Admin paneli bağlantısını yalnızca yöneticiye göstermek için.
  const { user: currentUser } = useCurrentUser();
  const [hesapSiliniyor, setHesapSiliniyor] = useState(false);
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const gutter = pageGutter(isDesktop);
  const prefs = useAppPrefs();
  const tour = useTour();
  // Bildirimden gelindiğinde doğrudan ilgili sekme açılır (ör. destek yanıtı
  // push bildirimi: /settings?sekme=destek). Geçersiz değer varsayılana düşer.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("sekme");
  const [tab, setTab] = useState<SettingsTab>(
    TABS.some((sekme) => sekme.key === requestedTab) ? (requestedTab as SettingsTab) : "hesap"
  );
  const [fontScale, setFontScale] = useState<FontScaleOption>(getFontScaleOption());
  const homeTarget = useHomeTarget();
  const [homeTargetModalOpen, setHomeTargetModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordAgain, setNewPasswordAgain] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  const loadMe = () =>
    api
      .get<User>("/auth/me")
      .then((u) => {
        setMe(u);
        setUsername(u.username);
      })
      .catch(() => setMe(null));

  useEffect(() => {
    void loadMe();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("projelio_token");
    navigate("/login");
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError("");
    setUsernameSaved(false);
    setSavingUsername(true);
    try {
      const updated = await api.patch<{ username: string }>("/users/me/username", { username });
      setUsername(updated.username);
      setUsernameSaved(true);
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : t("Kullanıcı adı güncellenemedi."));
    } finally {
      setSavingUsername(false);
    }
  };

  const handleFontScaleChange = (option: FontScaleOption) => {
    if (option === fontScale) return;
    setFontScale(option);
    setFontScaleOption(option);
    // Uygulama genelindeki yazı boyutu <html> üzerinde uygulanıyor; en temiz
    // ve tutarlı yol sayfayı yeniden yüklemek (index.html'deki script bunu
    // boyamadan önce uygular, titreme olmaz).
    window.location.reload();
  };

  // Şifresi olmayan hesaplar da var (Google ile açılanlar): orada "mevcut şifre"
  // sorulmaz, kullanıcı ilk şifresini belirler (bkz. users.service changePassword).
  const hasPassword = me?.hasPassword !== false;
  // Herkese açık demo hesabında şifre değiştirme ve hesap silme kapalı: arka uç
  // zaten reddediyor (bkz. backend/src/common/demo-hesap.ts), burada da formu
  // hiç göstermiyoruz ki ziyaretçi doldurup hataya çarpmasın.
  const demoHesabi = me?.email?.toLowerCase() === demoHesap.email;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);
    if (newPassword.length < 8) {
      setPasswordError(t("Yeni şifre en az 8 karakter olmalı."));
      return;
    }
    if (newPassword !== newPasswordAgain) {
      setPasswordError(t("Yeni şifreler birbirini tutmuyor."));
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch("/users/me/password", {
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordAgain("");
      setPasswordSaved(true);
      await loadMe();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : t("Şifre değiştirilemedi."));
    } finally {
      setSavingPassword(false);
    }
  };

  // Yasal metinler kimlik doğrulaması gerektirmeyen ekranlar (App.tsx →
  // isAuthScreen); geri bağlantısı Ayarlar'a dönsün diye nereden gelindiği
  // taşınıyor (bkz. lib/backTarget.ts).
  const openLegal = (to: string) =>
    navigate(to, { state: backState({ to: "/settings", label: "Ayarlar" }) });

  const hesapTab = (
    <>
      <SettingCard
        title="Profil"
        description={t("Ad soyad, unvan, kısa açıklama ve profil fotoğrafın — anasayfadaki kişi kartında görünür.")}
      >
        <button
          type="button"
          onClick={() => setProfileModalOpen(true)}
          disabled={!me}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: c.background,
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                flexShrink: 0,
                overflow: "hidden",
                background: c.surface,
                border: `1px solid ${c.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {me?.avatarUrl ? (
                <img
                  src={me.avatarUrl}
                  alt=""
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <IconUser size={15} color={c.textSecondary} />
              )}
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 15,
                  color: c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {me?.fullName ?? "…"}
              </span>
              {me?.title && (
                <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>{me.title}</span>
              )}
            </span>
          </span>
          <IconChevronRight size={16} color={c.textSecondary} />
        </button>
      </SettingCard>

      <SettingCard
        title={t("WhatsApp numarası")}
        description={t("Doğrulanmış numaran — elle yazılmaz, telefonundan gönderdiğin kodla eşleşir (Bağlı hesaplar sekmesi).")}
      >
        <WhatsappProfileCard />
      </SettingCard>

      <SettingCard title={t("Kullanıcı adı")} description={t("Ekip üyesi eklerken seni bu kullanıcı adıyla arayabilirler.")}>
        <form onSubmit={handleUsernameSubmit} style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: c.textSecondary,
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              @
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.replace(/^@/, ""));
                setUsernameSaved(false);
              }}
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_.]{3,30}"
              style={{ width: "100%", paddingLeft: 26 }}
              disabled={!me}
            />
          </div>
          <button
            type="submit"
            disabled={savingUsername || !me || username === me?.username}
            style={{ background: c.primary, color: c.onPrimary, padding: "0 16px", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500 }}
          >
            {savingUsername ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </form>
        {usernameError && <p style={{ color: c.danger, fontSize: 14, margin: "8px 0 0" }}>{usernameError}</p>}
        {usernameSaved && !usernameError && (
          <p style={{ color: c.success, fontSize: 14, margin: "8px 0 0" }}>{t("Kullanıcı adı güncellendi.")}</p>
        )}
      </SettingCard>

      {demoHesabi ? (
        <SettingCard
          title={t("Demo hesabı")}
          description={t("Bu hesap üye olmadan gezmek isteyenler için herkese açık. Şifresi değiştirilemez, hesap silinemez ve içeride yaptığın her değişiklik bir sonraki girişte geri alınır — istediğin gibi kurcalayabilirsin.")}
        >
          <span />
        </SettingCard>
      ) : (
      <SettingCard
        title={hasPassword ? t("Şifre değiştir") : t("Şifre belirle")}
        description={
          hasPassword
            ? t("En az 8 karakter. Değişiklikten sonra açık oturumların kapanmaz.")
            : t(
                "Hesabın Google ile açılmış, henüz şifresi yok. Bir şifre belirlersen e-posta ve şifreyle de giriş yapabilirsin."
              )
        }
      >
        <form onSubmit={handlePasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {hasPassword && (
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setPasswordSaved(false);
              }}
              placeholder={t("Mevcut şifren")}
              autoComplete="current-password"
              style={{ width: "100%" }}
              disabled={!me}
            />
          )}
          <input
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordSaved(false);
            }}
            placeholder={t("Yeni şifre")}
            autoComplete="new-password"
            minLength={8}
            style={{ width: "100%" }}
            disabled={!me}
          />
          <input
            type="password"
            value={newPasswordAgain}
            onChange={(e) => {
              setNewPasswordAgain(e.target.value);
              setPasswordSaved(false);
            }}
            placeholder={t("Yeni şifre (tekrar)")}
            autoComplete="new-password"
            minLength={8}
            style={{ width: "100%" }}
            disabled={!me}
          />
          <button
            type="submit"
            disabled={savingPassword || !me || !newPassword}
            style={{
              alignSelf: "flex-start",
              background: c.primary,
              color: c.onPrimary,
              padding: "9px 16px",
              borderRadius: 8,
              border: "none",
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            {savingPassword ? t("Kaydediliyor…") : hasPassword ? t("Şifreyi değiştir") : t("Şifreyi belirle")}
          </button>
        </form>
        {passwordError && <p style={{ color: c.danger, fontSize: 14, margin: "8px 0 0" }}>{passwordError}</p>}
        {passwordSaved && !passwordError && (
          <p style={{ color: c.success, fontSize: 14, margin: "8px 0 0" }}>{t("Şifren güncellendi.")}</p>
        )}
      </SettingCard>
      )}

      <CardGroup label={t("Hesabına bağlı sayfalar")}>
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
          {/*
            Yalnızca yöneticiye gösterilir. Arka uç zaten rol denetimi yapıyor
            (bkz. AdminController @Roles("admin")), yani bağlantı görünse de
            normal kullanıcı veri alamıyordu; ama herkese "Admin paneli" satırı
            göstermek hem kafa karıştırıyor hem de olmayan bir yetki varmış
            izlenimi veriyor. Sidebar bunu zaten doğru yapıyordu (bkz. Sidebar.tsx).
          */}
          {currentUser?.role === "admin" && (
            <>
              <button onClick={() => navigate("/admin")} style={linkRowStyle}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <IconShield size={17} color={c.textSecondary} />
                  <span style={{ fontSize: 17, color: c.textPrimary }}>Admin paneli</span>
                </span>
                <IconChevronRight size={16} color={c.textSecondary} />
              </button>

              <div style={{ borderTop: `1px solid ${c.border}` }} />
            </>
          )}

          <button onClick={() => navigate("/settings/ai-credits")} style={linkRowStyle}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconSparkle size={17} color={c.accent} />
              <span style={{ fontSize: 17, color: c.textPrimary }}>AI kredilerim</span>
            </span>
            <IconChevronRight size={16} color={c.textSecondary} />
          </button>

          <div style={{ borderTop: `1px solid ${c.border}` }} />

          <button onClick={() => navigate("/settings/archive")} style={linkRowStyle}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconArchive size={17} color={c.textSecondary} />
              <span style={{ fontSize: 17, color: c.textPrimary }}>{t("Arşiv")}</span>
            </span>
            <IconChevronRight size={16} color={c.textSecondary} />
          </button>
        </div>
      </CardGroup>

      {/*
        Hesap silme en sonda ve ayrı: yanlışlıkla basılmasın diye diğer
        ayarlarla aynı öbekte değil. Onay ve sonuç önizlemesi modalde
        (bkz. DeleteAccountModal) — buradaki düğme yalnızca kapıyı açıyor.
      */}
      {!demoHesabi && (
        <CardGroup label={t("Tehlikeli bölge")}>
          <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
            <button onClick={() => setHesapSiliniyor(true)} style={linkRowStyle}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 17, color: c.danger }}>{t("Hesabımı sil")}</span>
              </span>
              <IconChevronRight size={16} color={c.textSecondary} />
            </button>
          </div>
        </CardGroup>
      )}

      {hesapSiliniyor && (
        <DeleteAccountModal hasPassword={hasPassword} onClose={() => setHesapSiliniyor(false)} />
      )}

      {/* Yasal metinler giriş ekranından da açılabiliyor ama oturum açmış
          kullanıcının politikaya ulaşabileceği tek yer burası. */}
      <CardGroup label="Yasal">
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
          <button onClick={() => openLegal("/terms")} style={linkRowStyle}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconFile size={17} color={c.textSecondary} />
              <span style={{ fontSize: 17, color: c.textPrimary }}>{t("Kullanıcı Sözleşmesi")}</span>
            </span>
            <IconChevronRight size={16} color={c.textSecondary} />
          </button>

          <div style={{ borderTop: `1px solid ${c.border}` }} />

          <button onClick={() => openLegal("/privacy")} style={linkRowStyle}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconShield size={17} color={c.textSecondary} />
              <span style={{ fontSize: 17, color: c.textPrimary }}>{t("Gizlilik Politikası")}</span>
            </span>
            <IconChevronRight size={16} color={c.textSecondary} />
          </button>

          <div style={{ borderTop: `1px solid ${c.border}` }} />

          <button onClick={() => openLegal("/kvkk")} style={linkRowStyle}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconFile size={17} color={c.textSecondary} />
              <span style={{ fontSize: 17, color: c.textPrimary }}>{t("KVKK Aydınlatma Metni")}</span>
            </span>
            <IconChevronRight size={16} color={c.textSecondary} />
          </button>
        </div>
      </CardGroup>

      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
        <button onClick={handleLogout} style={linkRowStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconLogout size={17} color={c.danger} />
            <span style={{ fontSize: 17, color: c.danger }}>{t("Çıkış yap")}</span>
          </span>
        </button>
      </div>
    </>
  );

  const gorunumTab = (
    <>
      <CardGroup label={t("Dil")}>
        <SettingCard
          title={t("Arayüz dili")}
          description={t(
            "Varsayılan olarak tarayıcının dili kullanılır. Seçim yaptığında hesabına kaydedilir ve e-postalar, bildirimler ve Lio da o dile geçer."
          )}
        >
          <SwatchRow>
            {DIL_SECENEKLERI.map((secenek) => {
              // "Otomatik" seçiliyken kullanıcı bir seçim YAPMAMIŞTIR (chosen=false);
              // hangi dile düştüğü ayrıca yazılıyor ki ekranın neden bu dilde
              // olduğu belli olsun.
              const active = secenek.value === null ? !chosen : chosen && locale === secenek.value;
              return (
                <button
                  key={secenek.value ?? "otomatik"}
                  onClick={() => setLocale(secenek.value)}
                  aria-pressed={active}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1.5px solid ${active ? c.primary : c.border}`,
                    background: active ? c.background : "transparent",
                    minWidth: 92,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary, lineHeight: 1 }}>
                    {secenek.kisa}
                  </span>
                  <span
                    style={{ fontSize: 11, color: active ? c.primary : c.textSecondary, fontWeight: active ? 500 : 400 }}
                  >
                    {secenek.value === null ? t("Otomatik") : secenek.ad}
                  </span>
                </button>
              );
            })}
          </SwatchRow>
        </SettingCard>
      </CardGroup>

      <CardGroup label={t("Erişilebilirlik")}>
        <SettingCard
          title={t("Yazı boyutu")}
          description={t("Görme zorluğu yaşıyorsan uygulamadaki yazıları ve arayüzü büyütebilirsin.")}
        >
          <SwatchRow>
            {FONT_SCALE_OPTIONS.map((option) => {
              const active = fontScale === option;
              return (
                <button
                  key={option}
                  onClick={() => handleFontScaleChange(option)}
                  aria-pressed={active}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `1.5px solid ${active ? c.primary : c.border}`,
                    background: active ? c.background : "transparent",
                    minWidth: 70,
                  }}
                >
                  <span
                    style={{
                      fontSize: Math.round(FONT_SCALE_VALUES[option] * 14),
                      fontWeight: 600,
                      color: c.textPrimary,
                      lineHeight: 1,
                    }}
                  >
                    A
                  </span>
                  <span style={{ fontSize: 11, color: active ? c.primary : c.textSecondary, fontWeight: active ? 500 : 400 }}>
                    {FONT_SCALE_LABELS[option]}
                  </span>
                </button>
              );
            })}
          </SwatchRow>
        </SettingCard>

        <SettingCard
          title="Hareketi azalt"
          description={t("Geçiş ve animasyonları neredeyse tamamen kapatır. Baş dönmesi/odaklanma sorunu yaşıyorsan ya da arayüzün daha hızlı hissettirmesini istiyorsan aç.")}
        >
          <Toggle checked={prefs.reduceMotion} onChange={prefs.setReduceMotion} />
        </SettingCard>
      </CardGroup>

      <CardGroup label="Tema ve renkler">
        <SettingCard title="Tema" description={t("Aydınlık veya karanlık görünümü seç. Tercih bu cihazda saklanır.")}>
          <SwatchRow>
            <SwatchButton
              active={theme.mode === "light"}
              onClick={() => theme.setMode("light")}
              label={t("Aydınlık")}
              swatch={{ background: "#F7F8FA", border: "1px solid #E3E6EB" }}
            />
            <SwatchButton
              active={theme.mode === "dark"}
              onClick={() => theme.setMode("dark")}
              label={t("Karanlık")}
              swatch={{ background: "#12151B", border: "1px solid #2A3140" }}
            />
          </SwatchRow>
        </SettingCard>

        <SettingCard
          title="Vurgu rengi"
          description={t("Düğmelerde ve seçili öğelerde kullanılan rengi Projelio paletinden değiştir.")}
        >
          <SwatchRow>
            {(Object.keys(accentPresets) as (keyof typeof accentPresets)[]).map((key) => (
              <SwatchButton
                key={key}
                active={theme.accentKey === key}
                onClick={() => theme.setAccentKey(key)}
                label={accentPresets[key].label}
                swatch={{ background: accentPresets[key][theme.mode].accent }}
              />
            ))}
          </SwatchRow>
        </SettingCard>

        <SettingCard title={t("Kenar çubuğu rengi")} description={t("Soldaki menünün rengini kişiselleştir.")}>
          <SwatchRow>
            <SwatchButton
              active={theme.sidebarColorKey === "default"}
              onClick={() => theme.setSidebarColorKey("default")}
              label={t("Varsayılan")}
              swatch={{ background: c.primaryDark }}
            />
            {(Object.keys(sidebarColorPresets) as Exclude<SidebarColorKey, "default">[]).map((key) => (
              <SwatchButton
                key={key}
                active={theme.sidebarColorKey === key}
                onClick={() => theme.setSidebarColorKey(key)}
                label={sidebarColorPresets[key].label}
                swatch={{ background: sidebarColorPresets[key].value }}
              />
            ))}
          </SwatchRow>
        </SettingCard>

        <SettingCard title={t("Kenar çubuğu deseni")} description={t("Soldaki menünün arkasına ince bir doku ekle.")}>
          <SwatchRow>
            {(Object.keys(sidebarPatterns) as SidebarPatternKey[]).map((key) => (
              <SwatchButton
                key={key}
                active={theme.sidebarPatternKey === key}
                onClick={() => theme.setSidebarPatternKey(key)}
                label={sidebarPatterns[key].label}
                swatch={{
                  borderRadius: 4,
                  background: c.primaryDark,
                  backgroundImage: sidebarPatterns[key].backgroundImage,
                  backgroundSize: sidebarPatterns[key].backgroundSize,
                }}
              />
            ))}
          </SwatchRow>
        </SettingCard>
      </CardGroup>
    </>
  );

  // Masaüstünde bu ayara sidebar'daki "Ana Sayfa" satırının üstüne gelince
  // beliren dişliden de ulaşılır; mobilde sidebar bir çekmece ve hover kavramı
  // olmadığı için tek erişim noktası burasıdır.
  const gezinmeTab = (
    <>
      <SettingCard
        title={t("Ana Sayfa düğmesi")}
        description={t("Menüdeki Ana Sayfa düğmesine bastığında nereye gideceğini seçebilirsin. Bu tercih yalnızca bu cihazda geçerlidir.")}
      >
        <button
          type="button"
          onClick={() => setHomeTargetModalOpen(true)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: c.background,
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 15, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {homeTarget.label}
          </span>
          <IconChevronRight size={16} color={c.textSecondary} />
        </button>
      </SettingCard>

      <CardGroup label={t("Açılış")}>
        <SettingCard
          title={t("Kenar çubuğu açık başlasın")}
          description={t("Bilgisayarda uygulamayı açtığında soldaki menü açık mı gelsin? Kapalı seçersen sol üstteki okla açarsın. Telefonda menü her zaman kapalı başlar.")}
        >
          <Toggle checked={prefs.sidebarDefaultOpen} onChange={prefs.setSidebarDefaultOpen} />
        </SettingCard>

        <SettingCard
          title={t("Özet sayılar açık başlasın")}
          description={t("İş ve rutin sayfalarındaki proje/görev sayıları kutusu (dar ekranda katlanan özet) açık mı gelsin?")}
        >
          <Toggle checked={prefs.statsOpen} onChange={prefs.setStatsOpen} />
        </SettingCard>
      </CardGroup>
    </>
  );

  const yardimcilarTab = (
    <>
      <SettingCard
        title={t("Lio yardımcısı")}
        description={t("Sağ altta duran Lio balonu. Kapatırsan düğme gizlenir; Lio'yu Cmd/Ctrl + K ile yine açabilirsin.")}
      >
        <Toggle checked={prefs.showLio} onChange={prefs.setShowLio} />
      </SettingCard>

      <SettingCard
        title={t("Kim bu sayfada şeridi")}
        description={t("Aynı sayfada çalışan ekip arkadaşlarını sol altta gösteren ince şerit.")}
      >
        <Toggle checked={prefs.showPresence} onChange={prefs.setShowPresence} />
      </SettingCard>

      <SettingCard
        title={t("Kullanım turu")}
        description={t("Uygulamayı tanıtan sesli turu baştan izle. Tur, bulunduğun sayfadaki öğeleri işaret ederek ilerler.")}
      >
        <button
          type="button"
          onClick={() => tour.start("ilk-adimlar")}
          style={{
            background: c.primary,
            color: c.onPrimary,
            padding: "9px 16px",
            borderRadius: 8,
            border: "none",
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          {t("Turu yeniden başlat")}
        </button>
      </SettingCard>
    </>
  );

  // "ritim": takvim sayfasının ve Lio'nun dağıtım yaparken kullandığı çerçeve
  // (bkz. WorkRhythmSettings — kendi kartını çiziyor).
  const TAB_CONTENT: Record<SettingsTab, ReactNode> = {
    hesap: hesapTab,
    gorunum: gorunumTab,
    gezinme: gezinmeTab,
    yardimcilar: yardimcilarTab,
    ritim: <WorkRhythmSettings />,
    baglantilar: (
      <>
        <GoogleDriveCard />
        <OneDriveCard />
        <WhatsappCard />
      </>
    ),
    destek: <SupportPanel me={me} />,
  };

  // Etiketler TABS içinde Türkçe duruyor ve orada t() çağrılamıyor (modül
  // düzeyi, kanca yok); çeviri kullanıldığı yerde, yani burada yapılıyor.
  const activeLabel = t(TABS.find((sekme) => sekme.key === tab)?.label ?? "");

  // Sekme gövdesi: tüm kartlar aynı dikey boşlukla dizilir — kartların tek tek
  // marginTop taşıması bölümler arasında tutarsız aralıklara yol açıyordu.
  const contentColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{TAB_CONTENT[tab]}</div>
  );

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: `${isDesktop ? 32 : 20}px ${gutter}px 40px` }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 20px" }}>{t("Ayarlar")}</h1>

      {isDesktop ? (
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
          <nav style={{ width: NAV_WIDTH, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 96 }}>
            {TABS.map((sekme) => (
              <button
                key={sekme.key}
                type="button"
                onClick={() => setTab(sekme.key)}
                style={navItemStyle(tab === sekme.key, c)}
              >
                {t(sekme.label)}
              </button>
            ))}
          </nav>
          <div style={{ flex: 1, minWidth: 0, maxWidth: CONTENT_MAX_WIDTH }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 16px" }}>{activeLabel}</h2>
            {contentColumn}
          </div>
        </div>
      ) : (
        <>
          {/* Sekmeler dar ekranda sarmasın diye ortak TabBar: mobilde tek satır,
              yana kaydırmalı (bkz. components/TabBar.tsx). */}
          <TabBar
            tabs={TABS.map((sekme) => ({ ...sekme, label: t(sekme.label) }))}
            active={tab}
            onChange={(key) => setTab(key as SettingsTab)}
          />
          {contentColumn}
        </>
      )}

      {homeTargetModalOpen && <HomeTargetModal onClose={() => setHomeTargetModalOpen(false)} />}
      {profileModalOpen && me && (
        <EditProfileModal
          user={me}
          onClose={() => setProfileModalOpen(false)}
          onSaved={() => {
            setProfileModalOpen(false);
            void loadMe();
          }}
        />
      )}
    </div>
  );
}
