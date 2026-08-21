import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";

type Status = "checking" | "success" | "error";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("");
  const c = useThemeColors();

  // React StrictMode geliştirmede effect'leri iki kez çalıştırıyor; doğrulama
  // isteği iki kez giderse ikincisi "token kullanılmış" hatası alabilir.
  // (bkz. NotificationBell'deki aynı sorun ve çözümü.)
  const sentRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Bağlantı geçersiz. E-postandaki bağlantıyı kullandığından emin ol.");
      return;
    }
    if (sentRef.current) return;
    sentRef.current = true;

    api
      .post<{ message: string }>("/auth/verify-email", { token })
      .then((res) => {
        setStatus("success");
        setMessage(res?.message ?? "E-posta adresin doğrulandı.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Doğrulama başarısız oldu.");
      });
  }, [token]);

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

        {status === "checking" && (
          <>
            <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
              Doğrulanıyor…
            </h1>
            <p style={{ color: c.textSecondary, fontSize: 15, margin: 0 }}>Bir saniye.</p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
              Hesabın hazır
            </h1>
            <p style={{ color: c.textSecondary, fontSize: 15, margin: "0 0 22px", lineHeight: 1.6 }}>{message}</p>
            <Link
              to="/login"
              style={{
                display: "inline-block",
                background: c.primary,
                color: "#fff",
                textDecoration: "none",
                padding: "11px 22px",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 500,
              }}
            >
              Giriş yap
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
              Doğrulanamadı
            </h1>
            <p style={{ color: c.danger, fontSize: 15, margin: "0 0 22px", lineHeight: 1.6 }}>{message}</p>
            <Link to="/login" style={{ fontSize: 16, color: c.primary }}>
              Giriş ekranına dön
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
