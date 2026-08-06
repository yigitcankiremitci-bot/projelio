import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import type { User } from "@projelio/shared";
import { api } from "./api/client";
import OnboardingWizard from "./components/OnboardingWizard";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import GoogleReturn from "./pages/GoogleReturn";
import MicrosoftReturn from "./pages/MicrosoftReturn";
import JobDetail from "./pages/JobDetail";
import ProjectDetail from "./pages/ProjectDetail";
import OperationDetail from "./pages/OperationDetail";
import Organizations from "./pages/Organizations";
import OrganizationDetail from "./pages/OrganizationDetail";
import DepartmentDetail from "./pages/DepartmentDetail";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import CalendarView from "./pages/Calendar";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";
import Archive from "./pages/Archive";
import TasksOverview from "./pages/TasksOverview";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import NotificationBell from "./components/NotificationBell";
import AiLauncher from "./components/AiLauncher";
import AiCreditsPage from "./pages/AiCredits";
import { initPush } from "./push";
import { colors } from "./theme/colors";
import { ProjectFabContext } from "./lib/projectFab";
import type { ProjectFabAction } from "./lib/projectFab";
import { useIsDesktop } from "./lib/useIsDesktop";
import { SIDEBAR_WIDTH } from "./lib/layout";
import { IconChevronRight } from "./components/icons";

const HEADER_HEIGHT = 76;

export default function App() {
  const location = useLocation();
  // Google dönüş ekranı da kimlik doğrulaması gerektirmeyen bir ekrandır: token
  // henüz yerel depoda yok, tam da burada oluşturuluyor. Korumalı bölgeye
  // koyarsak /login'e yönlenir ve akış hiç tamamlanamaz.
  // Microsoft dönüşünde token zaten var (yalnızca "bağlama" akışı), ama aynı
  // bağımsız, tam ekran kart tasarımını paylaşması için burada tutuluyor.
  const isAuthScreen =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/google/return" ||
    location.pathname === "/microsoft/return";
  const hasToken = !!localStorage.getItem("projelio_token");
  const [fabAction, setFabAction] = useState<ProjectFabAction | null>(null);
  // Bilgisayarda (geniş ekran) sol sidebar + üstte tam genişlik header;
  // telefonda (dar ekran) sidebar kaybolur, alt menü (BottomNav) ve
  // sol üstte yüzen logo geri gelir. Pencere yeniden boyutlandırıldığında canlı güncellenir.
  const isDesktop = useIsDesktop();
  // Sidebar artık masaüstünde de mobilde de açılıp kapanabiliyor: masaüstünde
  // varsayılan açık (eski davranış), mobilde varsayılan kapalı (üstteki oka
  // basılınca bir çekmece gibi açılır). Ekran genişliği eşiği aşıldığında
  // (masaüstü <-> mobil geçişinde) varsayılana geri dönülür.
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  useEffect(() => {
    setSidebarOpen(isDesktop);
  }, [isDesktop]);
  // Giriş yapmış her kullanıcı için bir kez kontrol edilir: onboardingCompletedAt
  // boşsa (yeni kayıt ya da bu özellik eklenmeden önce kaydolmuş mevcut kullanıcı)
  // sihirbaz gösterilir, tamamlanana kadar uygulamanın geri kalanı erişilemez.
  const [me, setMe] = useState<User | null>(null);

  const reloadMe = () => {
    if (!hasToken || isAuthScreen) return;
    api.get<User>("/auth/me").then(setMe).catch(() => setMe(null));
  };

  useEffect(reloadMe, [hasToken, isAuthScreen]);

  useEffect(() => {
    if (!isAuthScreen) void initPush();
  }, [isAuthScreen]);

  if (isAuthScreen) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/google/return" element={<GoogleReturn />} />
        <Route path="/microsoft/return" element={<MicrosoftReturn />} />
      </Routes>
    );
  }

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  // İş/Proje/Program/Organizasyon/Departman/Grup detay sayfaları en üstte tam
  // genişlikte bir kapak fotoğrafı/gradyanı gösterir (bkz. ilgili sayfaların
  // return'ünün ilk elemanı). Bu sayfalarda kapak, sayfanın gerçek en üstüne
  // (y=0) kadar uzansın diye burada normalde her sayfaya uygulanan
  // HEADER_HEIGHT boşluğu ve dekoratif header çubuğunun opak arka planı
  // kaldırılır; sidebar açma düğmesi/logo/bildirim çanı/AI başlatıcı zaten
  // ayrı position:fixed öğeler olduğu için kapağın üzerinde yüzmeye devam eder.
  const isCoverPage = /^\/(jobs|projects|operations|organizations|departments|groups)\/[^/]+$/.test(
    location.pathname
  );

  const c = colors.light;

  return (
    <div style={{ minHeight: "100vh" }}>
      {me && !me.onboardingCompletedAt && <OnboardingWizard onCompleted={reloadMe} />}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} overlay={!isDesktop} />

      {/* Sidebar artık position:fixed olduğu için akışta yer kaplamıyor;
          içerik sütununu (yalnızca masaüstünde ve açıkken) onun genişliği kadar
          sağa kaydırıyoruz. Mobilde sidebar bir çekmece/overlay olduğu için
          içerik hiçbir zaman kaymaz. */}
      <div style={{ marginLeft: isDesktop && sidebarOpen ? SIDEBAR_WIDTH : 0, minHeight: "100vh", position: "relative" }}>
        {!isCoverPage && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: isDesktop && sidebarOpen ? SIDEBAR_WIDTH : 0,
              right: 0,
              height: HEADER_HEIGHT,
              background: c.surface,
              borderBottom: `1px solid ${c.border}`,
              boxShadow: "0 2px 6px rgba(26,31,41,0.05)",
              zIndex: 35,
            }}
          />
        )}
        {/* Sidebar kapalıyken (masaüstünde veya mobilde) sol üstte küçük bir ok
            butonu ve onun yanında Projelio logosu gösterilir; oka basınca sidebar
            açılır, logoya basınca ana sayfaya gidilir. Sidebar açıkken zaten kendi
            logosunu ve kapatma okunu içeriyor, burada ayrıca bir şey göstermeye
            gerek yok. */}
        {!sidebarOpen && (
          <>
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Sidebar'ı aç"
              title="Sidebar'ı aç"
              style={{
                position: "fixed",
                top: 14,
                left: 14,
                zIndex: 40,
                width: 40,
                height: 40,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: c.surface,
                border: `1px solid ${c.border}`,
                boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
              }}
            >
              <IconChevronRight size={18} color={c.textSecondary} />
            </button>
            <Link
              to="/"
              aria-label="Projelio - Ana sayfa"
              style={{
                position: "fixed",
                top: 10,
                left: 62,
                zIndex: 40,
                display: "flex",
                alignItems: "center",
              }}
            >
              <img src="/logo.png" alt="Projelio" style={{ width: 48, height: 48 }} />
            </Link>
          </>
        )}
        <NotificationBell />
        <AiLauncher />
        <ProjectFabContext.Provider value={{ action: fabAction, setAction: setFabAction }}>
          <div style={{ paddingTop: isCoverPage ? 0 : HEADER_HEIGHT, paddingBottom: isDesktop ? 28 : 84 }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/operations/:id" element={<OperationDetail />} />
              <Route path="/organizations" element={<Organizations />} />
              <Route path="/organizations/:id" element={<OrganizationDetail />} />
              <Route path="/departments/:id" element={<DepartmentDetail />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:id" element={<GroupDetail />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="/tasks" element={<TasksOverview />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/archive" element={<Archive />} />
              <Route path="/settings/ai-credits" element={<AiCreditsPage />} />
              <Route path="/admin" element={<AdminPanel />} />
            </Routes>
          </div>
          {/* Mobilde tam alt menü, masaüstünde ise sadece ortadaki "+" butonu olarak
              render edilir — karar BottomNav içinde isDesktop'a göre veriliyor. */}
          <BottomNav />
        </ProjectFabContext.Provider>
      </div>
    </div>
  );
}
