import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { colors } from "../theme/colors";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Şifre doğru ama e-posta doğrulanmamışsa backend 403 döner; bu durumda
  // kullanıcıya çıkışsız bir hata değil, "tekrar gönder" seçeneği sunmalıyız.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const c = colors.light;
  // Oturumu geçersizleşen kullanıcı buraya sebepsizce fırlatılmasın: neden
  // çıkarıldığını bilmezse "verilerim silindi" sanıyor (bkz. api/client.ts
  // handleExpiredSession).
  const sessionExpired = new URLSearchParams(window.location.search).get("session") === "expired";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setResendState("idle");
    setLoading(true);
    try {
      const { token } = await api.post<{ token: string }>("/auth/login", { email, password });
      localStorage.setItem("projelio_token", token);
      window.location.href = "/";
    } catch (err) {
      // Backend bazı durumlarda (ör. Google ile kaydolmuş bir hesaba şifreyle
      // giriş denemesi) özel, yardımcı bir mesaj döndürüyor — genel "hatalı"
      // mesajıyla ezmeyip onu göstermeliyiz.
      setError(err instanceof Error ? err.message : "E-posta veya şifre hatalı.");
      if (err instanceof ApiError && err.status === 403) setNeedsVerification(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendState("sending");
    try {
      await api.post("/auth/resend-verification", { email });
    } catch {
      // Yanıt her durumda aynı olduğu için ayrıca hata gösterilmez.
    }
    setResendState("sent");
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
          <h1 style={{ color: c.textPrimary, fontSize: 25, fontWeight: 600, margin: 0 }}>Projelio</h1>
          <p style={{ color: c.textSecondary, fontSize: 16, margin: "6px 0 0" }}>
            Freelance proje &amp; görev yönetimi
          </p>
        </div>

        {sessionExpired && (
          <p
            style={{
              color: c.textSecondary,
              fontSize: 15,
              margin: "0 0 16px",
              padding: "10px 12px",
              border: `1px solid ${c.border}`,
              borderRadius: 8,
            }}
          >
            Oturumun sona erdi. Verilerin yerinde — tekrar giriş yaptığında hepsi karşında olacak.
          </p>
        )}

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
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>Şifre</label>
              <Link to="/forgot-password" style={{ fontSize: 14, color: c.textSecondary }}>
                Şifremi unuttum
              </Link>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>

          {error && (
            <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>
          )}

          {needsVerification &&
            (resendState === "sent" ? (
              <p style={{ color: c.textSecondary, fontSize: 14, margin: 0 }}>
                Yeni doğrulama bağlantısı gönderildi. E-postanı kontrol et.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendState === "sending"}
                style={{
                  background: "transparent",
                  border: `1px solid ${c.border}`,
                  color: c.textSecondary,
                  padding: "9px 0",
                  borderRadius: 8,
                  fontSize: 15,
                }}
              >
                {resendState === "sending" ? "Gönderiliyor…" : "Doğrulama bağlantısını tekrar gönder"}
              </button>
            ))}

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
            {loading ? "Giriş yapılıyor…" : "Giriş yap"}
          </button>

          <Link to="/register" style={{ fontSize: 16, color: c.textSecondary, textAlign: "center", marginTop: 4 }}>
            Hesabın yok mu? Kayıt ol
          </Link>
        </form>

        <GoogleSignInButton label="Google ile giriş yap" />

        <Link
          to="/privacy"
          style={{
            display: "block",
            textAlign: "center",
            marginTop: 20,
            fontSize: 14,
            color: c.textSecondary,
          }}
        >
          Gizlilik Politikası
        </Link>
      </div>
    </div>
  );
}
