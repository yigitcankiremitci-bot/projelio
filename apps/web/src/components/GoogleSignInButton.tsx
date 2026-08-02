import { useEffect, useState } from "react";
import { driveApi } from "../api/files";
import { colors } from "../theme/colors";

/**
 * "Google ile devam et" düğmesi.
 *
 * Sunucuda Google istemci kimlikleri tanımlı değilse hiç render edilmez —
 * kullanıcıya tıklandığında hata veren bir düğme göstermek yerine.
 */
export default function GoogleSignInButton({ label = "Google ile devam et" }: { label?: string }) {
  const c = colors.light;
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    driveApi
      .loginUrl()
      .then((r) => setAvailable(Boolean(r.configured && r.url)))
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  const handleClick = async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await driveApi.loginUrl();
      if (url) window.location.href = url;
      else setError("Google girişi şu anda kullanılamıyor.");
    } catch (e: any) {
      setError(e?.message ?? "Google girişi başlatılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" }}>
        <div style={{ flex: 1, height: 1, background: c.border }} />
        <span style={{ fontSize: 14, color: c.textSecondary }}>veya</span>
        <div style={{ flex: 1, height: 1, background: c.border }} />
      </div>

      <button
        type="button"
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
        <GoogleGlyph />
        {busy ? "Yönlendiriliyor…" : label}
      </button>

      {error && <p style={{ color: c.danger, fontSize: 15, margin: "10px 0 0" }}>{error}</p>}
    </div>
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
