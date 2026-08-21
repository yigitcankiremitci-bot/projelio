import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const c = useThemeColors();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      // Backend hesabın var olup olmadığını hiçbir zaman ayrı bir sinyalle
      // belirtmiyor (bkz. PasswordResetService) — burada da her zaman aynı
      // "gönderildi" ekranını gösteriyoruz.
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti. Tekrar dene.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: c.background,
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 14,
          padding: "36px 32px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <img src="/logo.png" alt="Projelio" style={{ width: 48, height: 48, marginBottom: 14 }} />
          <h1 style={{ color: c.textPrimary, fontSize: 25, fontWeight: 600, margin: 0 }}>Şifremi unuttum</h1>
          <p style={{ color: c.textSecondary, fontSize: 16, margin: "6px 0 0", textAlign: "center" }}>
            E-posta adresini gir, sana bir sıfırlama bağlantısı gönderelim.
          </p>
        </div>

        {sent ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
            <p style={{ color: c.textPrimary, fontSize: 16, margin: 0 }}>
              Bu e-posta adresi kayıtlıysa, şifre sıfırlama bağlantısı gönderildi. Gelen kutunu kontrol et.
            </p>
            <Link to="/login" style={{ fontSize: 16, color: c.primary, textAlign: "center" }}>
              Girişe dön
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>E-posta</label>
              <input
                type="email"
                placeholder="ad.soyad@sirket.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>

            {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                background: c.primary,
                color: "#fff",
                padding: "11px 0",
                borderRadius: 8,
                border: "none",
                fontSize: 17,
                fontWeight: 500,
              }}
            >
              {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
            </button>

            <Link to="/login" style={{ fontSize: 16, color: c.textSecondary, textAlign: "center", marginTop: 4 }}>
              Girişe dön
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
