import { useEffect, useState } from "react";
import type { User } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { IconShield } from "../components/icons";
import AiCreditAdminPanel from "../components/AiCreditAdminPanel";

/**
 * Bu sayfa yalnızca role === "admin" olan kullanıcılara açılır.
 * Not: Sidebar'daki "Admin" linki de zaten yalnızca admin'lere gösteriliyor
 * (bkz. App.tsx / Sidebar.tsx); buradaki kontrol, birisi /admin adresine
 * doğrudan girerse diye ikinci bir savunma katmanıdır. Asıl güvenlik zaten
 * backend'de: her admin endpoint'i (kredi yükleme, marj raporu, bakiye
 * takibi) req.user.role === "admin" olmadan 403 döner.
 */
export default function AdminPanel() {
  const c = colors.light;
  const [me, setMe] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return null;

  if (!me || me.role !== "admin") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: c.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 320,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 14,
            padding: "32px 28px",
            textAlign: "center",
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: c.primaryDark,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <IconShield size={18} color={c.accent} />
          </span>
          <h2 style={{ color: c.textPrimary, fontSize: 20, fontWeight: 500, margin: "0 0 8px" }}>
            Bu sayfaya erişim yetkin yok
          </h2>
          <p style={{ color: c.textSecondary, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Admin paneli yalnızca yönetici hesapları içindir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 500, margin: "0 0 8px" }}>Admin paneli</h1>
      <p style={{ color: c.textSecondary, fontSize: 16, margin: "0 0 26px" }}>
        Kullanıcılar, proje istatistikleri ve sistem durumu burada listelenir.
      </p>

      <AiCreditAdminPanel />
    </div>
  );
}
