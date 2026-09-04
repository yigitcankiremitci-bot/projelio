import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { oneDriveApi } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Microsoft akışından dönüş ekranı. GoogleReturn.tsx ile aynı desende iki mod:
 *
 *  - giriş: `code=` gelir. Oturum jetonu URL'e konmaz (adres çubuğunda, tarayıcı
 *    geçmişinde ve Referer'da kalırdı); tek kullanımlık, 2 dakika ömürlü bir
 *    "devir kodu" gelir ve burada POST ile gerçek jetonla takas edilir.
 *  - OneDrive bağlama: `connected=1` gelir; kullanıcı zaten girişliydi, jeton
 *    değişmez.
 */
export default function MicrosoftReturn() {
  const [params] = useSearchParams();
  const c = useThemeColors();
  const [error, setError] = useState("");
  // Giriş denemesi mi OneDrive bağlama denemesi mi: hata kartının metnini ve
  // "geri dön" hedefini bu belirliyor.
  const isLogin = params.get("mode") === "login" || Boolean(params.get("code"));
  // React 18 StrictMode geliştirmede effect'i iki kez çalıştırır; kod tek
  // kullanımlık olduğu için ikinci çağrı "geçersiz kod" hatası verirdi.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const errorParam = params.get("error");
    const code = params.get("code");
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

    if (code) {
      oneDriveApi
        .exchange(code)
        .then(({ token }) => {
          localStorage.setItem("projelio_token", token);
          window.location.replace(next || "/");
        })
        .catch((e: Error) => setError(e.message));
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
              {isLogin ? "Microsoft ile devam edilemedi" : "OneDrive bağlanamadı"}
            </h1>
            <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
              {error}
            </p>
            <a
              href={isLogin ? "/login" : "/settings"}
              style={{
                display: "inline-block",
                padding: "9px 18px",
                borderRadius: 9,
                background: c.primary,
                color: c.onPrimary,
                fontSize: 15,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {isLogin ? "Girişe dön" : "Ayarlara dön"}
            </a>
          </>
        ) : (
          <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>
            {isLogin ? "Giriş yapılıyor…" : "Bağlanıyor…"}
          </p>
        )}
      </div>
    </div>
  );
}
