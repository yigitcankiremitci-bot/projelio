import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import JobDetail from "./pages/JobDetail";
import ProjectDetail from "./pages/ProjectDetail";
import CalendarView from "./pages/Calendar";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";
import Archive from "./pages/Archive";
import TasksOverview from "./pages/TasksOverview";
import BottomNav from "./components/BottomNav";
import NotificationBell from "./components/NotificationBell";
import { initPush } from "./push";
import { colors } from "./theme/colors";
import { ProjectFabContext } from "./lib/projectFab";
import type { ProjectFabAction } from "./lib/projectFab";

const HEADER_HEIGHT = 76;

export default function App() {
  const location = useLocation();
  const isAuthScreen = location.pathname === "/login" || location.pathname === "/register";
  const hasToken = !!localStorage.getItem("projelio_token");
  const [fabAction, setFabAction] = useState<ProjectFabAction | null>(null);

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
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_HEIGHT,
          background: c.surface,
          borderBottom: `1px solid ${c.border}`,
          boxShadow: "0 2px 6px rgba(26,31,41,0.05)",
          zIndex: 35,
        }}
      />
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
      <NotificationBell />
      <ProjectFabContext.Provider value={{ action: fabAction, setAction: setFabAction }}>
        <div style={{ paddingTop: HEADER_HEIGHT, paddingBottom: 84 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/tasks" element={<TasksOverview />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/archive" element={<Archive />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </div>
        <BottomNav />
      </ProjectFabContext.Provider>
    </div>
  );
}
