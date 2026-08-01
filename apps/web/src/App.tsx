import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import type { User } from "@projelio/shared";
import { api } from "./api/client";
import OnboardingWizard from "./components/OnboardingWizard";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import JobDetail from "./pages/JobDetail";
import ProjectDetail from "./pages/ProjectDetail";
import OperationDetail from "./pages/OperationDetail";
import Organizations from "./pages/Organizations";
import OrganizationDetail from "./pages/OrganizationDetail";
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

const HEADER_HEIGHT = 76;

export default function App() {
  const location = useLocation();
  const isAuthScreen = location.pathname === "/login" || location.pathname === "/register";
  const hasToken = !!localStorage.getItem("projelio_token");
  const [fabAction, setFabAction] = useState<ProjectFabAction | null>(null);
  // Bilgisayarda (geniş ekran) sol sidebar + üstte tam genişlik header;
  // telefonda (dar ekran) sidebar kaybolur, alt menü (BottomNav) ve
  // sol üstte yüzen logo geri gelir. Pencere yeniden boyutlandırıldığında canlı güncellenir.
  const isDesktop = useIsDesktop();
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
      </Routes>
    );
  }

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  const c = colors.light;

  return (
    <div style={{ minHeight: "100vh" }}>
      {me && !me.onboardingCompletedAt && <OnboardingWizard onCompleted={reloadMe} />}

      {isDesktop && <Sidebar />}

      {/* Sidebar artık position:fixed olduğu için akışta yer kaplamıyor;
          içerik sütununu onun genişliği kadar sağa kaydırıyoruz. */}
      <div style={{ marginLeft: isDesktop ? SIDEBAR_WIDTH : 0, minHeight: "100vh", position: "relative" }}>
        <div
          style={{
            position: "fixed",
            top: 0,
            left: isDesktop ? SIDEBAR_WIDTH : 0,
            right: 0,
            height: HEADER_HEIGHT,
            background: c.surface,
            borderBottom: `1px solid ${c.border}`,
            boxShadow: "0 2px 6px rgba(26,31,41,0.05)",
            zIndex: 35,
          }}
        />
        {/* Masaüstünde Projelio logosu zaten sidebar'ın üstünde görünüyor;
            burada tekrar göstermeye gerek yok, sadece mobilde (sidebar yokken) gösterilir. */}
        {!isDesktop && (
          <Link
            to="/"
            style={{
              position: "fixed",
              top: 14,
              left: 14,
              zIndex: 40,
              display: "flex",
              alignItems: "center",
            }}
          >
            <img src="/logo.png" alt="Projelio" style={{ width: 48, height: 48 }} />
          </Link>
        )}
        <NotificationBell />
        <AiLauncher />
        <ProjectFabContext.Provider value={{ action: fabAction, setAction: setFabAction }}>
          <div style={{ paddingTop: HEADER_HEIGHT, paddingBottom: isDesktop ? 28 : 84 }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/operations/:id" element={<OperationDetail />} />
              <Route path="/organizations" element={<Organizations />} />
              <Route path="/organizations/:id" element={<OrganizationDetail />} />
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
