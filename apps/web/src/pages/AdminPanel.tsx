import { useState } from "react";
import { colors } from "../theme/colors";
import { IconShield } from "../components/icons";
import AiCreditAdminPanel from "../components/AiCreditAdminPanel";

export default function AdminPanel() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const c = colors.light;

  if (!unlocked) {
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
          <h2 style={{ color: c.textPrimary, fontSize: 20, fontWeight: 500, margin: "0 0 16px" }}>
            Korumalı admin paneli
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="password"
              placeholder="Admin şifresi"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%" }}
            />
            <button
              onClick={() => setUnlocked(password.length > 0)}
              style={{ background: c.primary, color: "#fff", border: "none", padding: "10px 0", borderRadius: 8, fontSize: 17, fontWeight: 500 }}
            >
              Giriş
            </button>
          </div>
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
