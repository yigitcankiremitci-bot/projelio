import { useEffect, useState } from "react";
import { driveApi, oneDriveApi } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";

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
export default function SocialSignInButtons({ verb }: { verb: "giriş yap" | "kayıt ol" }) {
  const c = useThemeColors();
  const [googleReady, setGoogleReady] = useState(false);
  const [microsoftReady, setMicrosoftReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    driveApi
      .loginUrl()
      .then((r) => setGoogleReady(Boolean(r.configured && r.url)))
      .catch(() => setGoogleReady(false));
    oneDriveApi
      .loginUrl()
      .then((r) => setMicrosoftReady(Boolean(r.configured && r.url)))
      .catch(() => setMicrosoftReady(false));
  }, []);

  if (!googleReady && !microsoftReady) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" }}>
        <div style={{ flex: 1, height: 1, background: c.border }} />
        <span style={{ fontSize: 14, color: c.textSecondary }}>veya</span>
        <div style={{ flex: 1, height: 1, background: c.border }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {googleReady && (
          <ProviderButton
            requestUrl={() => driveApi.loginUrl()}
            label={`Google ile ${verb}`}
            glyph={<GoogleGlyph />}
            onError={setError}
          />
        )}
        {microsoftReady && (
          <ProviderButton
            requestUrl={() => oneDriveApi.loginUrl()}
            label={`Microsoft ile ${verb}`}
            // Kullanıcı çoğu zaman hesabını "Outlook hesabı" diye biliyor;
            // düğmenin markası Microsoft olmak zorunda (marka kuralları).
            hint="Outlook, Hotmail, Live ya da iş/okul hesabı"
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
  requestUrl: () => Promise<{ configured: boolean; url: string | null }>;
  label: string;
  hint?: string;
  glyph: React.ReactNode;
  onError: (message: string) => void;
}) {
  const c = useThemeColors();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    onError("");
    try {
      const { url } = await requestUrl();
      if (url) window.location.href = url;
      else {
        setBusy(false);
        onError("Bu giriş yöntemi şu anda kullanılamıyor.");
      }
    } catch (e: any) {
      setBusy(false);
      onError(e?.message ?? "Giriş başlatılamadı.");
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
      {busy ? "Yönlendiriliyor…" : label}
    </button>
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
