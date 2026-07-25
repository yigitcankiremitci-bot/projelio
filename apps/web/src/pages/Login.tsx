import { useState } from "react";
import { api } from "../api/client";
import { colors } from "../theme/colors";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const c = colors.light;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { token } = await api.post<{ token: string }>("/auth/login", { email, password });
    localStorage.setItem("projelio_token", token);
    window.location.href = "/";
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ color: c.primary, textAlign: "center" }}>Projelio</h1>
      <p style={{ textAlign: "center", color: c.textSecondary }}>
        Freelance Proje & Görev Yönetimi
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="email" placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" style={{ background: c.primary, color: "#fff", padding: 10, borderRadius: 8, border: "none" }}>
          Giriş Yap
        </button>
      </form>
    </div>
  );
}
