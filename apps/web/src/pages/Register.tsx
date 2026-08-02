import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { colors } from "../theme/colors";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const c = colors.light;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token } = await api.post<{ token: string }>("/auth/register", { fullName, email, password, username });
      localStorage.setItem("projelio_token", token);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt oluşturulamadı. E-posta zaten kullanılıyor olabilir.");
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
          <h1 style={{ color: c.textPrimary, fontSize: 25, fontWeight: 600, margin: 0 }}>Kayıt ol</h1>
          <p style={{ color: c.textSecondary, fontSize: 16, margin: "6px 0 0" }}>
            Freelance proje &amp; görev yönetimi
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Ad Soyad</label>
            <input
              type="text"
              placeholder="Ad Soyad"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Kullanıcı adı</label>
            <div style={{ position: "relative" }}>
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
                placeholder="kullaniciadi"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_.]{3,30}"
                style={{ width: "100%", paddingLeft: 26 }}
              />
            </div>
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
              Ekip üyesi eklerken seni bu kullanıcı adıyla arayabilirler.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Şifre</label>
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
            {loading ? "Kayıt oluşturuluyor…" : "Kayıt ol"}
          </button>

          <Link to="/login" style={{ fontSize: 16, color: c.textSecondary, textAlign: "center", marginTop: 4 }}>
            Zaten hesabın var mı? Giriş yap
          </Link>
        </form>

        <GoogleSignInButton label="Google ile kayıt ol" />
      </div>
    </div>
  );
}
