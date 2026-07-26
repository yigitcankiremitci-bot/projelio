import { useNavigate } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconShield, IconLogout, IconChevronRight } from "../components/icons";

const rowStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  background: "transparent",
  border: "none",
  textAlign: "left",
};

export default function Settings() {
  const c = colors.light;
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("projelio_token");
    navigate("/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 20px" }}>Ayarlar</h1>

      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", maxWidth: 420 }}>
        <button onClick={() => navigate("/admin")} style={rowStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconShield size={17} color={c.textSecondary} />
            <span style={{ fontSize: 14, color: c.textPrimary }}>Admin paneli</span>
          </span>
          <IconChevronRight size={16} color={c.textSecondary} />
        </button>

        <div style={{ borderTop: `1px solid ${c.border}` }} />

        <button onClick={handleLogout} style={rowStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconLogout size={17} color={c.danger} />
            <span style={{ fontSize: 14, color: c.danger }}>Çıkış yap</span>
          </span>
        </button>
      </div>
    </div>
  );
}
