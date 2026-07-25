import { Link } from "react-router-dom";
import { colors } from "../theme/colors";

export default function Navbar() {
  const c = colors.light;
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        background: c.primary,
        color: "#fff",
      }}
    >
      <strong>Projelio</strong>
      <div style={{ display: "flex", gap: 16 }}>
        <Link to="/" style={{ color: "#fff" }}>Ana Sayfa</Link>
        <Link to="/calendar" style={{ color: "#fff" }}>Takvim</Link>
        <Link to="/admin" style={{ color: "#fff" }}>Admin</Link>
        <Link to="/login" style={{ color: "#fff" }}>Giriş</Link>
      </div>
    </nav>
  );
}
