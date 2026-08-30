import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { backState } from "../lib/backTarget";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { useThemeColors } from "../theme/useThemeColors";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Kayıt artık doğrudan giriş yaptırmıyor: kullanıcı e-postasındaki bağlantıya
  // tıklamadan giriş yapamıyor (bkz. AuthService.register/login).
  const [registered, setRegistered] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const c = useThemeColors();
  // Yasal metinlerin geri bağlantısı buraya dönsün (bkz. lib/backTarget.ts).
  const registerBack = { to: "/register", label: "Kayıt sayfası" };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/register", { fullName, email, password, username });
      setRegistered(true);
    } catch (err) {
      // "E-posta zaten kullanılıyor" ARTIK BİR HATA DEĞİL: adres kayıtlıysa sunucu
      // yeni kayıtla aynı yanıtı döndürüp gerçek sahibine bildirim e-postası atıyor
      // (hesap varlığını sızdırmamak için, bkz. backend AuthService.register).
      // Buraya düşen tek beklenen durum kullanıcı adı çakışması.
      setError(err instanceof Error ? err.message : "Kayıt oluşturulamadı, tekrar dener misin?");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendState("sending");
    try {
      await api.post("/auth/resend-verification", { email });
    } catch {
      // Yanıt her durumda aynı olduğu için hata da kullanıcıya ayrı gösterilmez.
    }
    setResendState("sent");
  };

  if (registered) {
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
            textAlign: "center",
          }}
        >
          <img src="/logo.png" alt="Projelio" style={{ width: 48, height: 48, marginBottom: 14 }} />
          <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 600, margin: "0 0 10px" }}>
            E-postanı kontrol et
          </h1>
          <p style={{ color: c.textSecondary, fontSize: 15, margin: "0 0 6px", lineHeight: 1.6 }}>
            <strong style={{ color: c.textPrimary }}>{email}</strong> adresine bir doğrulama bağlantısı gönderdik.
            Bağlantıya tıkladıktan sonra giriş yapabilirsin.
          </p>
          <p style={{ color: c.textSecondary, fontSize: 13, margin: "0 0 6px", lineHeight: 1.6 }}>
            Bağlantı 24 saat geçerli. E-posta birkaç dakika içinde gelmezse spam klasörüne de bak.
          </p>
          {/*
            Bu cümle, kayıt ucunun bilerek sessiz kalmasının karşılığı: adres ZATEN
            kayıtlıysa sunucu yeni kayıtla birebir aynı yanıtı döndürüyor (hesap
            varlığını sızdırmamak için, bkz. backend AuthService.register). O zaman
            kullanıcı "kayıt oldum sandım" diye kalıyordu. Burada ne olduğunu
            anlatıyoruz ama HER İKİ durumda da aynı metni gösteriyoruz — saldırgan
            ayırt edemesin, gerçek kullanıcı da şaşırmasın.
          */}
          <p style={{ color: c.textSecondary, fontSize: 13, margin: "0 0 22px", lineHeight: 1.6 }}>
            Bu adresle zaten bir hesabın varsa yeni hesap açılmadı; onun yerine giriş
            yapmanı hatırlatan bir e-posta gönderdik.
          </p>

          {resendState === "sent" ? (
            <p style={{ color: c.textSecondary, fontSize: 14, margin: "0 0 18px" }}>
              Yeni bağlantı gönderildi.
            </p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resendState === "sending"}
              style={{
                background: "transparent",
                border: `1px solid ${c.border}`,
                color: c.textSecondary,
                padding: "9px 18px",
                borderRadius: 8,
                fontSize: 15,
                marginBottom: 18,
              }}
            >
              {resendState === "sending" ? "Gönderiliyor…" : "Bağlantıyı tekrar gönder"}
            </button>
          )}

          <div>
            <Link to="/login" style={{ fontSize: 16, color: c.primary }}>
              Giriş ekranına dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
              color: c.onPrimary,
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

        {/* Kayıt ekranında politikaya bağlantı vermek hem KVKK aydınlatma
            yükümlülüğü hem de Meta/Google uygulama incelemeleri için gerekli. */}
        <p
          style={{
            textAlign: "center",
            marginTop: 20,
            marginBottom: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: c.textSecondary,
          }}
        >
          Kayıt olarak{" "}
          <Link to="/terms" state={backState(registerBack)} style={{ color: c.primary }}>
            Kullanıcı Sözleşmesi
          </Link>
          'ni ve{" "}
          <Link to="/privacy" state={backState(registerBack)} style={{ color: c.primary }}>
            Gizlilik Politikası
          </Link>
          'nı okuduğunu ve kabul ettiğini beyan etmiş olursun.
        </p>
      </div>
    </div>
  );
}
