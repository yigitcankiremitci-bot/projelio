import { useEffect } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import JobDetail from "./pages/JobDetail";
import ProjectDetail from "./pages/ProjectDetail";
import CalendarView from "./pages/Calendar";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";
import TasksOverview from "./pages/TasksOverview";
import BottomNav from "./components/BottomNav";
import NotificationBell from "./components/NotificationBell";
import { initPush } from "./push";

export default function App() {
  const location = useLocation();
  const isAuthScreen = location.pathname === "/login";

  useEffect(() => {
    if (!isAuthScreen) void initPush();
  }, [isAuthScreen]);

  if (isAuthScreen) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Link
        to="/"
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
        }}
      >
        <img src="/logo.png" alt="Projelio" style={{ width: 32, height: 32 }} />
      </Link>
      <NotificationBell />
      <div style={{ paddingTop: 52, paddingBottom: 76 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/tasks" element={<TasksOverview />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  );
}
