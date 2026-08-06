import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { colors } from "../theme/colors";

/**
 * Microsoft/OneDrive akışından dönüş ekranı.
 *
 * GoogleReturn.tsx'ten farkı: burada tek bir mod var ("connect") — kullanıcı
 * zaten Projelio'ya girişini yapmıştı (token yerel depoda hâlâ duruyor), bu
 * yüzden bir "devir kodu" takas etmeye gerek yok. Backend yalnızca
 * `connected=1` ya da `error=...` ile yönlendirir.
 */
export default function MicrosoftReturn() {
  const [params] = useSearchParams();
  const c = colors.light;
  const [error, setError] = useState("");
  // React 18 StrictMode geliştirmede effect'i iki kez çalıştırabilir.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const errorParam = params.get("error");
    const connected = params.get("connected");
    const next = params.get("next");

    if (errorParam) {
      setError(
        errorParam === "access_denied"
          ? "Microsoft izni verilmedi. Devam etmek için izin vermeniz gerekiyor."
          : errorParam
      );
      return;
    }

    if (connected === "1") {
      window.location.replace(next || "/settings");
      return;
    }

    setError("Microsoft'tan beklenen yanıt gelmedi.");
  }, [params]);

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
          maxWidth: 380,
          width: "100%",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 14,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <img src="/logo.png" alt="Projelio" style={{ width: 44, height: 44, marginBottom: 14 }} />
        {error ? (
          <>
            <h1 style={{ fontSize: 19, fontWeight: 500, color: c.textPrimary, margin: "0 0 8px" }}>
              OneDrive bağlanamadı
            </h1>
            <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
              {error}
            </p>
            <a
              href="/settings"
              style={{
                display: "inline-block",
                padding: "9px 18px",
                borderRadius: 9,
                background: c.primary,
                color: "#fff",
                fontSize: 15,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Ayarlara dön
            </a>
          </>
        ) : (
          <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>Bağlanıyor…</p>
        )}
      </div>
    </div>
  );
}
