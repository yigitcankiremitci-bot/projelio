import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { colors } from "../theme/colors";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const c = colors.light;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre güncellenemedi. Bağlantının süresi dolmuş olabilir.");
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
          <h1 style={{ color: c.textPrimary, fontSize: 25, fontWeight: 600, margin: 0 }}>Yeni şifre belirle</h1>
        </div>

        {!token ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
            <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>
              Bağlantı geçersiz. Sıfırlama e-postasındaki bağlantıyı kullandığından emin ol.
            </p>
            <Link to="/forgot-password" style={{ fontSize: 16, color: c.primary, textAlign: "center" }}>
              Yeni bağlantı iste
            </Link>
          </div>
        ) : done ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
            <p style={{ color: c.textPrimary, fontSize: 16, margin: 0 }}>
              Şifren güncellendi. Artık yeni şifrenle giriş yapabilirsin.
            </p>
            <Link to="/login" style={{ fontSize: 16, color: c.primary, textAlign: "center" }}>
              Girişe git
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>Yeni şifre</label>
              <input
                type="password"
                placeholder="En az 8 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>Yeni şifre (tekrar)</label>
              <input
                type="password"
                placeholder="En az 8 karakter"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
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
              {loading ? "Güncelleniyor…" : "Şifreyi güncelle"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
