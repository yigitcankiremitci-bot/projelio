import { Link, useLocation, useNavigate } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconShield, IconLogout, IconCheck } from "./icons";

const navItems = [
  { to: "/", label: "Ana sayfa", icon: IconDashboard },
  { to: "/calendar", label: "Takvim", icon: IconCalendar },
  { to: "/admin", label: "Admin", icon: IconShield },
];

export default function Navbar() {
  const c = colors.light;
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("projelio_token");
    navigate("/login");
  };

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        height: 56,
        background: c.primaryDark,
        borderBottom: `1px solid ${c.primaryDark}`,
      }}
    >
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: c.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconCheck size={13} color={c.primaryDark} />
        </span>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>Projelio</span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
                gap: 7,
                padding: "7px 12px",
                borderRadius: 7,
                background: active ? "rgba(255,255,255,0.08)" : "transparent",
              }}
            >
              <Icon size={15} color={active ? c.accent : "#9AA6B4"} />
              <span style={{ fontSize: 13, color: active ? "#fff" : "#C7CCD6" }}>{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 12px",
            marginLeft: 8,
            borderRadius: 7,
            background: "transparent",
            border: "none",
          }}
        >
          <IconLogout size={15} color="#9AA6B4" />
          <span style={{ fontSize: 13, color: "#C7CCD6" }}>Çıkış</span>
        </button>
      </div>
    </nav>
  );
}
