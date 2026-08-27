import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useThemeColors } from "../theme/useThemeColors";
import { useSidebarStyle } from "../theme/useSidebarStyle";
import { IconChevronLeft, IconSettings } from "./icons";
import { SIDEBAR_WIDTH, DRAWER_WIDTH_CSS, Z } from "../lib/layout";
import SidebarTree from "./SidebarTree";
import HomeTargetModal from "./HomeTargetModal";
import { useHomeTarget, DEFAULT_HOME_TARGET } from "../lib/homeTarget";
import { tourAnchor } from "../lib/tour/types";

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
  const c = useThemeColors();
  const sidebarStyle = useSidebarStyle();
  const location = useLocation();
  // Bütçe ve Dosyalar, Ana Sayfa'nın kendi sekmeleridir (bkz. Dashboard.tsx ?tab=);
  // buradan doğrudan o sekmeyle açılacak şekilde bağlanır.
  const searchTab = new URLSearchParams(location.search).get("tab");
  // "Ana Sayfa" düğmesinin hedefi kullanıcı tarafından değiştirilebilir
  // (bkz. lib/homeTarget.ts). Etiket sabit kalır — değişen sadece nereye gittiği.
  const homeTarget = useHomeTarget();
  const [homeTargetModalOpen, setHomeTargetModalOpen] = useState(false);
  const homeIsDefault = homeTarget.path === DEFAULT_HOME_TARGET.path;

  const navItems: { to: string; label: string; active: boolean; isHome?: boolean }[] = [
    {
      to: homeTarget.path,
      label: "Ana Sayfa",
      isHome: true,
      active: homeIsDefault
        ? location.pathname === "/" && !searchTab
        : location.pathname + location.search === homeTarget.path,
    },
    { to: "/?tab=budget", label: "Bütçe", active: location.pathname === "/" && searchTab === "budget" },
    { to: "/?tab=files", label: "Dosyalar", active: location.pathname === "/" && searchTab === "files" },
    { to: "/calendar", label: "Takvim", active: location.pathname.startsWith("/calendar") },
    // Mobilde BottomNav'da olan "Yapılacaklar" (/tasks) masaüstünde hiçbir yerden
    // erişilebilir değildi; aynı sayfa buraya da bağlandı.
    { to: "/tasks", label: "Yapılacaklar", active: location.pathname.startsWith("/tasks") },
    // Ayarlar diğer sayfalarla aynı listede, Yapılacaklar'ın hemen altında.
    // Önceden en altta, gezinme ağacından sonra, "Çıkış yap" ile birlikte ayrı
    // bir öbekteydi; orada bir sayfa değil bir "kapanış" gibi duruyordu.
    { to: "/settings", label: "Ayarlar", active: location.pathname.startsWith("/settings") },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", active: location.pathname.startsWith("/admin") }] : []),
  ];

  if (!open) return null;

  return (
    <>
      {/* Mobilde sidebar bir çekmece gibi davranır: arkasındaki karartmaya
          tıklayınca kapanır. Masaüstünde overlay yok, sidebar zaten içerik
          sütununu iterek yer kaplıyor. */}
      {overlay && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(15,18,25,0.45)", zIndex: Z.drawerScrim }}
        />
      )}
      <aside
        className="app-sidebar"
        {...tourAnchor("sidebar")}
        style={{
          // Çekmece genişliği ekran genişliğine de bağlı: arkada dokunulabilir
          // bir karartma şeridi kalmalı (bkz. lib/layout DRAWER_WIDTH_CSS).
          width: overlay ? DRAWER_WIDTH_CSS : SIDEBAR_WIDTH,
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
          // Çekmece hâlindeyken çan, tur düğmesi ve Lio balonu dahil bütün sabit
          // öğelerin ÜSTÜNDE; yerinde dururken (masaüstü) onların altında.
          zIndex: overlay ? Z.drawer : Z.sidebarDocked,
          background: sidebarStyle.background,
          backgroundImage: sidebarStyle.backgroundImage,
          backgroundSize: sidebarStyle.backgroundSize,
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

        {/* Sayfa bağlantıları ikonsuz, buton görünümlü satırlar. Hover/aktif
            durumları ve geçiş animasyonları src/index.css'teki .sidebar-nav-btn
            sınıfında (inline style ile :hover yazılamıyor). */}
        {navItems.map((item) => {
          const link = (
            <Link
              to={item.to}
              className={`sidebar-nav-btn${item.active ? " is-active" : ""}`}
              aria-current={item.active ? "page" : undefined}
              title={item.isHome && !homeIsDefault ? `Ana Sayfa → ${homeTarget.label}` : undefined}
            >
              {item.label}
            </Link>
          );
          // Ana Sayfa satırında, yalnızca üstüne gelince beliren bir dişli var:
          // düğmenin nereye gideceğini seçtiren modalı açar. Mobilde sidebar bir
          // çekmece ve hover kavramı yok — orada aynı ayar Ayarlar sayfasında.
          // key olarak "to" kullanılamaz: kullanıcı Ana Sayfa hedefini örneğin
          // /tasks yaparsa iki satır aynı yolu gösterip key çakışması olur.
          if (!item.isHome || overlay) return <div key={item.label}>{link}</div>;
          return (
            <div key={item.label} className="sidebar-nav-row">
              {link}
              <button
                type="button"
                className="sidebar-nav-gear"
                onClick={() => setHomeTargetModalOpen(true)}
                aria-label="Ana Sayfa düğmesinin gideceği yeri değiştir"
                title="Ana Sayfa düğmesini ayarla"
              >
                <IconSettings size={14} color="#C7CCD6" />
              </button>
            </div>
          );
        })}

      {/* Grup > Organizasyon > İş gezinme ağacı: yalnızca kullanıcının erişebildiği
          en az bir grup/organizasyon/iş varsa bir şey render eder. */}
      <div {...tourAnchor("sidebar-tree")}>
        <SidebarTree />
      </div>

      {/* Buradaki alt öbek kaldırıldı: "Ayarlar" yukarıdaki gezinme listesine
          taşındı, "Çıkış yap" ise yalnızca Ayarlar > Hesap'ta duruyor. Çıkışın
          gezinmenin dibinde, ağacın hemen altında durması onu yanlışlıkla
          tıklanabilecek bir komşu yapıyordu. */}
    </aside>

    {homeTargetModalOpen && <HomeTargetModal onClose={() => setHomeTargetModalOpen(false)} />}
    </>
  );
}
