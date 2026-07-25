import { useState } from "react";
import { colors } from "../theme/colors";

export default function AdminPanel() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const c = colors.light;

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 320, margin: "80px auto", textAlign: "center" }}>
        <h2 style={{ color: c.primary }}>Korumalı Admin Paneli</h2>
        <input
          type="password"
          placeholder="Admin şifresi"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          onClick={() => setUnlocked(password.length > 0)}
          style={{ marginLeft: 8, background: c.primary, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8 }}
        >
          Giriş
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: c.textPrimary }}>Admin Paneli</h1>
      <p style={{ color: c.textSecondary }}>Kullanıcılar, proje istatistikleri ve sistem durumu burada listelenir.</p>
    </div>
  );
}
