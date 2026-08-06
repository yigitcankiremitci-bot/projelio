import { Link, useLocation, useNavigate } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconShield, IconLogout, IconSettings, IconActivity, IconFile, IconChevronLeft } from "./icons";
import { SIDEBAR_WIDTH } from "../lib/layout";
import SidebarTree from "./SidebarTree";

interface Props {
  // Kapalıyken sidebar hiç render edilmez (App.tsx'te bunun yerine küçük bir
  // açma oku gösterilir). Masaüstünde içerik sütununu itip yer kaplar, mobilde
  // ise arka planı karartan bir örtü (overlay) ile birlikte üste biner.
  open: boolean;
  onClose: () => void;
  // true ise (mobil) sabit genişlikte bir çekmece gibi davranır ve arkasına
  // tıklanınca kapanan bir karartma katmanı eklenir; false ise (masaüstü)
  // mevcut sabit panel davranışı korunur.
  overlay: boolean;
  // Admin linki sadece role === "admin" olan kullanıcılarda gösterilir. Asıl korumayı
  // AdminPanel.tsx (ve her admin endpoint'inin backend'deki assertAdmin kontrolü) sağlar;
  // burası sadece navigasyonda gereksiz/karışıklık yaratan bir linki gizler.
  isAdmin: boolean;
}

export default function Sidebar({ open, onClose, overlay, isAdmin }: Props) {
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
    ...(isAdmin
      ? [{ to: "/admin", label: "Admin", icon: IconShield, active: location.pathname.startsWith("/admin") }]
      : []),
  ];

  const handleLogout = () => {
    localStorage.removeItem("projelio_token");
    navigate("/login");
  };

  if (!open) return null;

  return (
    <>
      {/* Mobilde sidebar bir çekmece gibi davranır: arkasındaki karartmaya
          tıklayınca kapanır. Masaüstünde overlay yok, sidebar zaten içerik
          sütununu iterek yer kaplıyor. */}
      {overlay && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(15,18,25,0.45)", zIndex: 37 }}
        />
      )}
      <aside
        className="app-sidebar"
        style={{
          width: overlay ? Math.min(SIDEBAR_WIDTH + 24, 360) : SIDEBAR_WIDTH,
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
          zIndex: overlay ? 38 : 36,
          background: c.primaryDark,
          boxShadow: overlay ? "2px 0 18px rgba(15,18,25,0.3)" : "none",
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 4px 22px 6px" }}>
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
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
          <button
            onClick={onClose}
            aria-label="Sidebar'ı kapat"
            title="Sidebar'ı kapat"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.06)",
              border: "none",
            }}
          >
            <IconChevronLeft size={15} color="#9AA6B4" />
          </button>
        </div>

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
    </>
  );
}
