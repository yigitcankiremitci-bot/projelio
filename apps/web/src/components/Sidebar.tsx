import { Link, useLocation, useNavigate } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconShield, IconLogout, IconCheck } from "./icons";

const navItems = [
  { to: "/", label: "Ana Sayfa", icon: IconDashboard },
  { to: "/calendar", label: "Takvim", icon: IconCalendar },
  { to: "/admin", label: "Admin", icon: IconShield },
];

export default function Sidebar() {
  const c = colors.light;
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("projelio_token");
    navigate("/login");
  };

  return (
    <aside
      className="app-sidebar"
      style={{
        width: 208,
        flexShrink: 0,
        minHeight: "100vh",
        background: c.primaryDark,
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <Link
        to="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 10px 22px",
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: c.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconCheck size={15} color={c.primaryDark} />
        </span>
        <span style={{ color: "#fff", fontSize: 20, fontWeight: 600 }}>Projelio</span>
      </Link>

      {navItems.map((item) => {
        const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: 8,
              background: active ? "rgba(255,255,255,0.08)" : "transparent",
              borderLeft: active ? `2px solid ${c.accent}` : "2px solid transparent",
            }}
          >
            <Icon size={16} color={active ? c.accent : "#9AA6B4"} />
            <span style={{ fontSize: 16, color: active ? "#fff" : "#C7CCD6" }}>{item.label}</span>
          </Link>
        );
      })}

      <div style={{ marginTop: "auto" }}>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 10px",
            borderRadius: 8,
            background: "transparent",
            border: "none",
          }}
        >
          <IconLogout size={16} color="#9AA6B4" />
          <span style={{ fontSize: 16, color: "#C7CCD6" }}>Çıkış yap</span>
        </button>
      </div>
    </aside>
  );
}
