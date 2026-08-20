import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { colors } from "../theme/colors";

/**
 * Habie'ye bağlanma köprüsü.
 *
 * Habie ayrı bir alan adında çalışıyor, dolayısıyla Projelio'nun
 * localStorage'ındaki oturum token'ını okuyamaz. Bu sayfa aradaki köprü:
 * token'ı burada okuyup backend'den tek kullanımlık bir devir kodu alıyor ve
 * kullanıcıyı o kodla Habie'ye yönlendiriyor.
 *
 * Token URL'e KONMAZ — adres çubuğunda, tarayıcı geçmişinde ve Referer
 * başlığında kalırdı. Aynı desen Google akışında da kullanılıyor
 * (bkz. GoogleReturn.tsx).
 *
 * Bu yol giriş yönteminden bağımsız çalışır: parolayla da Google ile de
 * kaydolmuş olsan, önemli olan Projelio'da açık bir oturumun olması.
 */
const HABIE_URL =
  (import.meta.env.VITE_HABIE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://habiechat.netlify.app";

export default function HabieConnect() {
  const c = colors.light;
  const [error, setError] = useState("");
  // React 18 StrictMode effect'i iki kez çalıştırır; kod tek kullanımlık.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = localStorage.getItem("projelio_token");
    if (!token) {
      window.location.replace("/login");
      return;
    }

    (async () => {
      try {
        const { code } = await api.post<{ code: string }>("/habie/handoff", {});
        window.location.replace(`${HABIE_URL}/?code=${encodeURIComponent(code)}`);
      } catch (e: any) {
        setError(e?.message ?? "Habie bağlantısı kurulamadı.");
      }
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: c.background }}>
      <div style={{ textAlign: "center", maxWidth: 340 }}>
        <h2 style={{ margin: "0 0 8px", color: c.textPrimary, fontSize: 20 }}>
          {error ? "Bağlanılamadı" : "Habie'ye bağlanılıyor…"}
        </h2>
        {error ? (
          <>
            <p style={{ color: "#b91c1c", fontSize: 14, lineHeight: 1.5 }}>{error}</p>
            <a href="/" style={{ color: c.primary, fontSize: 14 }}>Panele dön</a>
          </>
        ) : (
          <p style={{ color: c.textSecondary, fontSize: 14, lineHeight: 1.5 }}>
            Birkaç saniye sürebilir, otomatik yönlendirileceksin.
          </p>
        )}
      </div>
    </div>
  );
}
