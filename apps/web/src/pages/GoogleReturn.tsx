import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { driveApi } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { kabukDonusuTarayicidaMi, kabukIsaretiniTemizle } from "../lib/mobilKabuk";
import KabugaDonKarti from "../components/KabugaDonKarti";

/**
 * Google akışından dönüş ekranı.
 *
 * Backend, oturum token'ını doğrudan URL'e koymaz — adres çubuğunda, tarayıcı
 * geçmişinde ve Referer başlığında kalırdı. Bunun yerine tek kullanımlık, 2
 * dakika ömürlü bir "devir kodu" gelir; burada POST ile gerçek token'la takas
 * edilir.
 */
export default function GoogleReturn() {
  const [params] = useSearchParams();
  const c = useThemeColors();
  const t = useT();
  const [error, setError] = useState("");
  // Dönüş tarayıcıda kaldıysa kurtarma ekranı gösterilir ve devir kodu
  // TAKAS EDİLMEZ; kod tek kullanımlık, burada harcanırsa kullanıcı
  // uygulamaya hiç geçemez (bkz. components/KabugaDonKarti).
  const [kurtarma, setKurtarma] = useState(false);
  const [tarayicidaDevam, setTarayicidaDevam] = useState(false);
  // React 18 StrictMode geliştirmede effect'i iki kez çalıştırır; kod tek
  // kullanımlık olduğu için ikinci çağrı "geçersiz kod" hatası verirdi.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (!tarayicidaDevam && kabukDonusuTarayicidaMi(params.get("next"))) {
      setKurtarma(true);
      return;
    }
    handled.current = true;

    const errorParam = params.get("error");
    const code = params.get("code");
    const connected = params.get("connected");
    const next = kabukIsaretiniTemizle(params.get("next"));

    if (errorParam) {
      setError(
        errorParam === "access_denied"
          ? t("Google izni verilmedi. Devam etmek için izin vermeniz gerekiyor.")
          : errorParam
      );
      return;
    }

    // Drive bağlama akışı: kullanıcı zaten giriş yapmıştı, token değişmiyor.
    if (connected === "1") {
      window.location.replace(next || "/settings");
      return;
    }

    if (!code) {
      setError(t("Google'dan beklenen yanıt gelmedi."));
      return;
    }

    driveApi
      .exchange(code)
      .then(({ token }) => {
        localStorage.setItem("projelio_token", token);
        window.location.replace(next || "/");
      })
      .catch((e: Error) => setError(e.message));
  }, [params, tarayicidaDevam]);

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
        {kurtarma ? (
          <KabugaDonKarti
            onTarayicidaDevam={() => {
              setKurtarma(false);
              setTarayicidaDevam(true);
            }}
          />
        ) : error ? (
          <>
            <h1 style={{ fontSize: 19, fontWeight: 500, color: c.textPrimary, margin: "0 0 8px" }}>
              {t("Google ile devam edilemedi")}
            </h1>
            <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
              {error}
            </p>
            <a
              href="/login"
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
              {t("Girişe dön")}
            </a>
          </>
        ) : (
          <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>{t("Giriş yapılıyor…")}</p>
        )}
      </div>
    </div>
  );
}
