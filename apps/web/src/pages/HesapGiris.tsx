import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import GirisDilSecici from "../components/GirisDilSecici";

/**
 * E-postadaki tek kullanımlık giriş bağlantısının açtığı sayfa (Ekip
 * Hesapları, bkz. backend GirisBaglantisiService).
 *
 * Token POST ile takas edilir, sayfa açılır açılmaz değil de bir kez: e-posta
 * istemcilerinin bağlantı önizleyicileri GET yapar, POST yapmaz — GET'le
 * takas edilseydi önizleme bağlantıyı kişi tıklamadan yakardı.
 *
 * Başarılıysa oturum yazılır ve uygulamaya geçilir; "ilk girişte şifreni
 * belirle" isteği varsa onu uygulama kabuğu gösterir (bkz. IlkSifreModal).
 */
export default function HesapGiris() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [hata, setHata] = useState("");
  const c = useThemeColors();
  const t = useT();

  // StrictMode effect'i iki kez çalıştırır; ikinci istek "kullanılmış" hatası alırdı.
  const gonderildi = useRef(false);

  useEffect(() => {
    if (!token) {
      setHata(t("Bağlantı geçersiz. E-postandaki bağlantıyı kullandığından emin ol."));
      return;
    }
    if (gonderildi.current) return;
    gonderildi.current = true;

    api
      .post<{ token: string }>("/auth/giris-baglantisi", { token })
      .then((res) => {
        localStorage.setItem("projelio_token", res.token);
        // Tam yeniden yükleme: uygulama kabuğu (me, soket, push) yeni
        // oturumla baştan kurulsun — giriş ekranı da aynısını yapıyor.
        window.location.replace("/");
      })
      .catch((err) => setHata(err instanceof Error ? err.message : t("Giriş yapılamadı.")));
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
      <GirisDilSecici />
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
        {!hata ? (
          <>
            <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
              {t("Hesabına giriliyor…")}
            </h1>
            <p style={{ color: c.textSecondary, fontSize: 15, margin: 0 }}>{t("Bir saniye.")}</p>
          </>
        ) : (
          <>
            <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
              {t("Giriş yapılamadı")}
            </h1>
            <p style={{ color: c.danger, fontSize: 15, margin: "0 0 22px", lineHeight: 1.6 }}>{hata}</p>
            <Link to="/login" style={{ fontSize: 16, color: c.primary }}>
              {t("Giriş ekranına dön")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
