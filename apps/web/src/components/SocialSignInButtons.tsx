import { useEffect, useState } from "react";
import { driveApi, oneDriveApi } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import {
  girisAdresiniSistemTarayicisindaAc,
  kabukAppleGirisiVarMi,
  kabukAppleIleGiris,
  kabukDonusHedefi,
  kabukPlatformu,
  kabuktaMi,
} from "../lib/mobilKabuk";
import { api } from "../api/client";
import { useLocale } from "../lib/i18n";

/**
 * Giriş/kayıt ekranlarındaki sağlayıcı düğmeleri (Google, Microsoft).
 *
 * Sunucuda o sağlayıcının istemci kimlikleri tanımlı değilse o düğme hiç
 * render edilmez — kullanıcıya tıklandığında hata veren bir düğme göstermek
 * yerine. Hiçbiri yoksa "veya" ayracı da çizilmez.
 *
 * Düğmeler tek bileşende toplandı: ayrı ayrı olduklarında her biri kendi "veya"
 * ayracını çiziyordu ve iki sağlayıcı açıkken ekranda iki ayraç görünüyordu.
 */
/**
 * `verb` bir SÖZCÜK değil, bir KİP.
 *
 * Eskiden `Google ile ${verb}` diye cümleye gömülüyordu. İngilizcede sözcük
 * sırası ters ("Sign in with Google"), yani yer tutucu yetmiyor: her sağlayıcı
 * ve kip için tam cümle gerekiyor.
 */
export default function SocialSignInButtons({ verb }: { verb: "giris" | "kayit" }) {
  const c = useThemeColors();
  const t = useT();
  const [googleReady, setGoogleReady] = useState(false);
  const [microsoftReady, setMicrosoftReady] = useState(false);
  const [error, setError] = useState("");
  // iPhone'da Google/Microsoft GİZLİ (kullanıcı kararı, 2026-11-12): dönüş
  // bağlantısı (Universal Link) cihazda denenmedi. Onların yerine iPhone'da
  // "Apple ile giriş" var (App Store kuralı 4.8, bkz. AppleButonu).
  // DİKKAT: yalnızca Google/Microsoft ile açılmış (şifresiz) hesaplar
  // iPhone'a GİREMEZ — şifre sıfırlama şifresiz hesaba bağlantı göndermiyor
  // (password-reset.service.ts). Android ve web etkilenmez.
  const gizli = kabukPlatformu() === "ios";

  useEffect(() => {
    if (gizli) return;
    driveApi
      .loginUrl()
      .then((r) => setGoogleReady(Boolean(r.configured && r.url)))
      .catch(() => setGoogleReady(false));
    oneDriveApi
      .loginUrl()
      .then((r) => setMicrosoftReady(Boolean(r.configured && r.url)))
      .catch(() => setMicrosoftReady(false));
  }, [gizli]);

  const apple = kabukAppleGirisiVarMi();
  if (gizli ? !apple : !googleReady && !microsoftReady) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" }}>
        <div style={{ flex: 1, height: 1, background: c.border }} />
        <span style={{ fontSize: 14, color: c.textSecondary }}>{t("veya")}</span>
        <div style={{ flex: 1, height: 1, background: c.border }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {apple && <AppleButonu verb={verb} onError={setError} />}
        {googleReady && (
          <ProviderButton
            requestUrl={(next) => driveApi.loginUrl(next)}
            label={verb === "giris" ? t("Google ile giriş yap") : t("Google ile kayıt ol")}
            glyph={<GoogleGlyph />}
            onError={setError}
          />
        )}
        {microsoftReady && (
          <ProviderButton
            requestUrl={(next) => oneDriveApi.loginUrl(next)}
            label={verb === "giris" ? t("Microsoft ile giriş yap") : t("Microsoft ile kayıt ol")}
            // Kullanıcı çoğu zaman hesabını "Outlook hesabı" diye biliyor;
            // düğmenin markası Microsoft olmak zorunda (marka kuralları).
            hint={t("Outlook, Hotmail, Live ya da iş/okul hesabı")}
            glyph={<MicrosoftGlyph />}
            onError={setError}
          />
        )}
      </div>

      {error && <p style={{ color: c.danger, fontSize: 15, margin: "10px 0 0" }}>{error}</p>}
    </div>
  );
}

function ProviderButton({
  requestUrl,
  label,
  hint,
  glyph,
  onError,
}: {
  /**
   * Adres AÇILIŞTA DEĞİL, tıklanınca alınır: içindeki imzalı `state` 10 dakika
   * ömürlü. Ekranı açık bırakıp sonra tıklayan kullanıcı, açılışta alınmış bir
   * adresle "istek süresi dolmuş" hatasına düşerdi.
   */
  requestUrl: (next?: string) => Promise<{ configured: boolean; url: string | null }>;
  label: string;
  hint?: string;
  glyph: React.ReactNode;
  onError: (message: string) => void;
}) {
  const t = useT();
  const c = useThemeColors();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    onError("");
    try {
      // Kabuktan başlatılan akışa işaret konuyor: dönüş tarayıcıda kalırsa
      // dönüş sayfası bunu anlayıp kurtarma ekranı gösteriyor (bkz.
      // lib/mobilKabuk.ts kabukDonusuTarayicidaMi). Tarayıcıda başlatılan
      // girişlerde işaret YOK — onlar hiç etkilenmemeli.
      const { url } = await requestUrl(kabuktaMi() ? kabukDonusHedefi() : undefined);
      if (url) {
        // Mobil kabukta aynı sekmede yönlendirmek ÇALIŞMAZ: Google gömülü
        // WebView'da giriş sayfasını açmayı reddediyor. Adres sistem
        // tarayıcısına verilir; dönüşü App Link olarak uygulama yakalar
        // (bkz. lib/mobilKabuk.ts). Tarayıcıda bu çağrı false döner ve
        // her şey eskisi gibi işler.
        if (!girisAdresiniSistemTarayicisindaAc(url)) window.location.href = url;
        // Kabukta sayfa DEĞİŞMİYOR; düğme "Yönlendiriliyor…" hâlinde asılı
        // kalmasın, kullanıcı vazgeçip geri dönebilir.
        else setBusy(false);
      } else {
        setBusy(false);
        onError(t("Bu giriş yöntemi şu anda kullanılamıyor."));
      }
    } catch (e: any) {
      setBusy(false);
      onError(e?.message ?? t("Giriş başlatılamadı."));
    }
  };

  return (
    <button
      type="button"
      title={hint}
      onClick={handleClick}
      disabled={busy}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "11px 16px",
        borderRadius: 9,
        border: `1px solid ${c.border}`,
        background: c.surface,
        color: c.textPrimary,
        fontSize: 16,
        fontWeight: 500,
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {glyph}
      {busy ? t("Yönlendiriliyor…") : label}
    </button>
  );
}

/** Ham nonce: 32 rastgele bayt, hex. Sunucu özetini jetonda arar. */
function rastgeleNonce(): string {
  const baytlar = new Uint8Array(32);
  crypto.getRandomValues(baytlar);
  return Array.from(baytlar, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * iPhone'daki "Apple ile giriş" düğmesi.
 *
 * Google'dan farkı: yönlendirme yok. iPhone'un yerel penceresi jetonu
 * doğrudan verir, jeton /auth/apple'a gider, dönen oturumla sayfa yenilenir.
 *
 * GÖRÜNÜM Apple'ın kuralına göre: siyah ya da beyaz zemin, Apple logosu,
 * "Apple ile giriş yap". Renkler temadan (ana metin rengi zemin olur): açık
 * temada siyah, koyu temada beyaz düğme — ikisi de Apple'ın izin verdiği stil.
 */
function AppleButonu({ verb, onError }: { verb: "giris" | "kayit"; onError: (message: string) => void }) {
  const t = useT();
  const c = useThemeColors();
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    onError("");
    try {
      const nonce = rastgeleNonce();
      const sonuc = await kabukAppleIleGiris(nonce);
      if (!sonuc) return; // vazgeçti
      const { token } = await api.post<{ token: string }>("/auth/apple", {
        identityToken: sonuc.identityToken,
        nonce,
        adSoyad: sonuc.adSoyad,
        locale,
      });
      localStorage.setItem("projelio_token", token);
      window.location.replace("/");
    } catch (err) {
      onError(err instanceof Error && err.message ? err.message : t("Apple ile giriş tamamlanamadı."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "11px 16px",
        borderRadius: 9,
        border: `1px solid ${c.textPrimary}`,
        background: c.textPrimary,
        color: c.surface,
        fontSize: 16,
        fontWeight: 500,
        cursor: busy ? "wait" : "pointer",
      }}
    >
      <AppleGlyph />
      {busy ? t("Bekleniyor…") : verb === "giris" ? t("Apple ile giriş yap") : t("Apple ile kayıt ol")}
    </button>
  );
}

/** Apple logosu — düğmenin metin rengini alır (Apple'ın tek renkli kuralı). */
function AppleGlyph() {
  return (
    <svg width={17} height={17} viewBox="0 0 384 512" aria-hidden="true">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}

/** Google'ın resmi "G" işareti — marka rengi olduğu için temaya boyanmaz. */
function GoogleGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.3 6.6v5.5h7c4.1-3.8 6.6-9.4 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-7-5.5c-1.9 1.3-4.4 2.1-7.3 2.1-5.6 0-10.4-3.8-12.1-8.9H4.7v5.6C8.3 41.4 15.6 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.9 28.5c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.6H4.7C3.2 17.6 2.4 20.7 2.4 24s.8 6.4 2.3 9.2l7.2-4.7z"
      />
      <path
        fill="#EA4335"
        d="M24 11.3c3.2 0 6 1.1 8.2 3.2l6.2-6.2C34.7 4.8 29.8 2.7 24 2.7 15.6 2.7 8.3 7.3 4.7 14.7l7.2 5.6c1.7-5.1 6.5-9 12.1-9z"
      />
    </svg>
  );
}

/** Microsoft'un resmi dört kareli işareti — marka rengi olduğu için temaya boyanmaz. */
function MicrosoftGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 23 23">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}
