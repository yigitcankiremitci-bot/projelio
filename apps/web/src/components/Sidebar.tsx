import { Link, useLocation, useNavigate } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconShield, IconLogout, IconCheck, IconBuilding, IconLayers } from "./icons";
import { SIDEBAR_WIDTH } from "../lib/layout";
import { useNavVisibility } from "../lib/useNavVisibility";

export default function Sidebar() {
  const c = colors.light;
  const location = useLocation();
  const navigate = useNavigate();
  const { showOrganizations, showGroups } = useNavVisibility();

  const navItems = [
    { to: "/", label: "Ana Sayfa", icon: IconDashboard },
    ...(showOrganizations ? [{ to: "/organizations", label: "Organizasyonlar", icon: IconBuilding }] : []),
    ...(showGroups ? [{ to: "/groups", label: "Gruplar", icon: IconLayers }] : []),
    { to: "/calendar", label: "Takvim", icon: IconCalendar },
    { to: "/admin", label: "Admin", icon: IconShield },
  ];

  const handleLogout = () => {
    localStorage.removeItem("projelio_token");
    navigate("/login");
  };

  return (
    <aside
      className="app-sidebar"
      style={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        // Sidebar'ı akıştan tamamen çıkarıp viewport'a sabitliyoruz (position: fixed).
        // Kasıtlı olarak "height: 100vh" KULLANMIYORUZ: bu uygulamada Ayarlar >
        // Erişilebilirlik'teki yazı boyutu, <html> üzerine CSS "zoom" uygulayarak
        // çalışıyor (bkz. index.html) ve zoom ile "vh" birimleri bazı tarayıcılarda
        // birlikte tutarsız hesaplanıp sidebar'ın gerçek viewport'tan kısa render
        // olmasına (ve altında boşluk kalmasına) yol açabiliyor. Bunun yerine
        // top:0 ve bottom:0 ile iki ucu da viewport'a sabitliyoruz — yükseklik zoom
        // seviyesinden bağımsız olarak her zaman "üstten alta kadar" olur.
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        overflowY: "auto",
        zIndex: 36,
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
