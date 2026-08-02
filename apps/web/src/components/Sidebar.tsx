import { Link, useLocation, useNavigate } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconShield, IconLogout, IconSettings, IconActivity, IconFile } from "./icons";
import { SIDEBAR_WIDTH } from "../lib/layout";
import SidebarTree from "./SidebarTree";

export default function Sidebar() {
  const c = colors.light;
  const location = useLocation();
  const navigate = useNavigate();
  // Bütçe ve Dosyalar, Ana Sayfa'nın kendi sekmeleridir (bkz. Dashboard.tsx ?tab=);
  // buradan doğrudan o sekmeyle açılacak şekilde bağlanır.
  const searchTab = new URLSearchParams(location.search).get("tab");

  const navItems = [
    { to: "/", label: "Ana Sayfa", icon: IconDashboard, active: location.pathname === "/" && !searchTab },
    { to: "/?tab=budget", label: "Bütçe", icon: IconActivity, active: location.pathname === "/" && searchTab === "budget" },
    { to: "/?tab=files", label: "Dosyalar", icon: IconFile, active: location.pathname === "/" && searchTab === "files" },
    { to: "/calendar", label: "Takvim", icon: IconCalendar, active: location.pathname.startsWith("/calendar") },
    { to: "/admin", label: "Admin", icon: IconShield, active: location.pathname.startsWith("/admin") },
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
            width: 34,
            height: 34,
            borderRadius: 8,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <img src="/logo.png" alt="Projelio" style={{ width: 24, height: 24 }} />
        </span>
        <span style={{ color: c.accent, fontSize: 20, fontWeight: 600 }}>Projelio</span>
      </Link>

      {navItems.map((item) => {
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
              background: item.active ? "rgba(255,255,255,0.08)" : "transparent",
              borderLeft: item.active ? `2px solid ${c.accent}` : "2px solid transparent",
            }}
          >
            <Icon size={16} color={item.active ? c.accent : "#9AA6B4"} />
            <span style={{ fontSize: 16, color: item.active ? "#fff" : "#C7CCD6" }}>{item.label}</span>
          </Link>
        );
      })}

      {/* Grup > Organizasyon > İş gezinme ağacı: yalnızca kullanıcının erişebildiği
          en az bir grup/organizasyon/iş varsa bir şey render eder. */}
      <SidebarTree />

      <div style={{ marginTop: "auto" }}>
        <Link
          to="/settings"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 10px",
            borderRadius: 8,
            background: location.pathname.startsWith("/settings") ? "rgba(255,255,255,0.08)" : "transparent",
            borderLeft: location.pathname.startsWith("/settings") ? `2px solid ${c.accent}` : "2px solid transparent",
          }}
        >
          <IconSettings size={16} color={location.pathname.startsWith("/settings") ? c.accent : "#9AA6B4"} />
          <span style={{ fontSize: 16, color: location.pathname.startsWith("/settings") ? "#fff" : "#C7CCD6" }}>
            Ayarlar
          </span>
        </Link>
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
