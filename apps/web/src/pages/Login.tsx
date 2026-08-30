import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { backState } from "../lib/backTarget";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { demoHesap } from "../lib/demoHesap";
import { useThemeColors } from "../theme/useThemeColors";

/** 905 -> "15:05". Geri sayım dakika:saniye okunması en kolay biçim. */
function formatSure(saniye: number): string {
  const dk = Math.floor(saniye / 60);
  const sn = saniye % 60;
  return `${dk}:${String(sn).padStart(2, "0")}`;
}

export default function Login() {
  // Tanıtım sitesindeki "Demo hesabıyla gez" bağlantısı buraya ?demo=1 ile
  // geliyor; alanları hazır dolduruyoruz ki ziyaretçi kopyala-yapıştırla
  // uğraşmasın. Şifre zaten sitede de yazıyor, gizlenecek bir şey yok.
  const demoIstendi = new URLSearchParams(window.location.search).get("demo") === "1";
  const [email, setEmail] = useState(demoIstendi ? demoHesap.email : "");
  const [password, setPassword] = useState(demoIstendi ? demoHesap.password : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Şifre doğru ama e-posta doğrulanmamışsa backend 403 döner; bu durumda
  // kullanıcıya çıkışsız bir hata değil, "tekrar gönder" seçeneği sunmalıyız.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  /**
   * Hesap kilidinde (429) kalan saniye. Sunucu kaç saniye kaldığını söylüyor
   * (bkz. LoginAttemptService); burada saniye saniye eritiyoruz ki kullanıcı
   * "biraz sonra" gibi belirsiz bir cümle yerine sayacı görsün.
   */
  const [lockSeconds, setLockSeconds] = useState(0);
  const c = useThemeColors();
  // Oturumu geçersizleşen kullanıcı buraya sebepsizce fırlatılmasın: neden
  // çıkarıldığını bilmezse "verilerim silindi" sanıyor (bkz. api/client.ts
  // handleExpiredSession).
  const sessionExpired = new URLSearchParams(window.location.search).get("session") === "expired";
  // Yasal metinlerin geri bağlantısı buraya dönsün (bkz. lib/backTarget.ts).
  const loginBack = { to: "/login", label: "Giriş sayfası" };

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const t = setTimeout(() => setLockSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lockSeconds]);

  /**
   * Giriş isteği. E-posta/şifreyi state'ten okumak yerine PARAMETRE alıyor:
   * demo düğmesi alanları doldurmayı beklemeden doğrudan demo bilgileriyle
   * çağırıyor — setEmail'in ardından state'i okusaydık React güncellemeyi
   * henüz işlememiş olacağı için bir önceki (boş) değeri gönderirdik.
   */
  const girisYap = async (girisEmail: string, girisSifre: string) => {
    setError("");
    setNeedsVerification(false);
    setResendState("idle");
    setLoading(true);
    try {
      const { token } = await api.post<{ token: string }>("/auth/login", {
        email: girisEmail,
        password: girisSifre,
      });
      localStorage.setItem("projelio_token", token);
      window.location.href = "/";
    } catch (err) {
      // Backend bazı durumlarda (ör. Google ile kaydolmuş bir hesaba şifreyle
      // giriş denemesi) özel, yardımcı bir mesaj döndürüyor — genel "hatalı"
      // mesajıyla ezmeyip onu göstermeliyiz.
      setError(err instanceof Error ? err.message : "E-posta veya şifre hatalı.");
      if (err instanceof ApiError && err.status === 403) setNeedsVerification(true);
      if (err instanceof ApiError && err.status === 429) setLockSeconds(err.retryAfterSeconds ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await girisYap(email, password);
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
            <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>
              {error}
              {lockSeconds > 0 && (
                <>
                  {" "}
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                    Kalan süre {formatSure(lockSeconds)}.
                  </strong>
                </>
              )}
            </p>
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
              color: c.onPrimary,
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

        {/*
          DEMO HESABI — üye olmadan içeriyi gezmek isteyenler için.
          Şifre bilerek açıkta yazıyor: aynı bilgiler tanıtım sitesinde de
          yayımlanıyor, buradan gizlemek yalnızca ziyaretçiyi zorlardı.
          Hesap herkese açık ve ORTAK olduğu için "kişisel bilgi girme"
          uyarısı şart — ziyaretçi burayı kendi hesabı sanmasın.
        */}
        <div
          style={{
            marginTop: 22,
            padding: "14px 16px",
            border: `1px solid ${c.accent}`,
            borderRadius: 10,
            background: c.background,
          }}
        >
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.textPrimary }}>
            Üye olmadan gezmek ister misin?
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: c.textSecondary }}>
            Hazır bir demo hesabı var: örnek bir şirketin projeleri, görevleri, bütçesi ve
            raporlarıyla birlikte her yeri dolaşabilirsin.
          </p>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: c.textSecondary,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              wordBreak: "break-all",
            }}
          >
            {demoHesap.email} · {demoHesap.password}
          </p>
          <button
            type="button"
            onClick={() => girisYap(demoHesap.email, demoHesap.password)}
            disabled={loading}
            style={{
              marginTop: 12,
              width: "100%",
              background: c.accent,
              color: "#fff",
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            {loading ? "Giriş yapılıyor…" : "Demo hesabıyla gir"}
          </button>
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: c.textSecondary }}>
            Her şeyi deneyebilirsin: eklediğin, değiştirdiğin, sildiğin ne varsa bir sonraki
            girişte ilk haline döner. Hesap herkese açık olduğu için aynı anda başkaları da
            içeride olabilir — gerçek veri ya da kişisel bilgi girme.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            marginTop: 20,
            fontSize: 14,
            color: c.textSecondary,
          }}
        >
          <Link to="/terms" state={backState(loginBack)} style={{ color: c.textSecondary }}>
            Kullanıcı Sözleşmesi
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" state={backState(loginBack)} style={{ color: c.textSecondary }}>
            Gizlilik Politikası
          </Link>
        </div>
      </div>
    </div>
  );
}
