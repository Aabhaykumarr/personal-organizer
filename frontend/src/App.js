import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import SummaryPdfModal from "./components/SummaryPdfModal";
import "./index.css";

// Pages
import LoginPage    from "./pages/LoginPage";
import SignupPage   from "./pages/SignupPage";
import NotesPage    from "./pages/NotesPage";
import SchedulePage from "./pages/SchedulePage";
import TasksPage    from "./pages/TasksPage";
import MedsPage     from "./pages/MedsPage";

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ onOpenSummary }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        🗂 Organizer
        <span>Welcome, {user?.username}</span>
      </div>

      <nav>
        <NavLink to="/notes"     className={({ isActive }) => isActive ? "active" : ""}>📝 Notes & Media</NavLink>
        <NavLink to="/schedule"  className={({ isActive }) => isActive ? "active" : ""}>📅 Schedule & Goals</NavLink>
        <NavLink to="/tasks"     className={({ isActive }) => isActive ? "active" : ""}>✅ Task Dashboard</NavLink>
        <NavLink to="/reminders" className={({ isActive }) => isActive ? "active" : ""}>💊 Care Reminders</NavLink>
      </nav>

      <div style={{ padding: "0 12px", marginTop: 14 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ width: "100%", justifyContent: "center", background: "linear-gradient(135deg, #2563eb, #7c3aed)", border: "none" }}
          onClick={onOpenSummary}
        >
          📊 AI Summary & PDF
        </button>
      </div>

      <div className="sidebar-bottom">
        <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ width: "100%" }}>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Protected layout ──────────────────────────────────────────────────────────
function AppShell({ children }) {
  const { user, loading } = useAuth();
  const [summaryOpen, setSummaryOpen] = useState(false);

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh" }}><div className="spinner" /></div>;
  if (!user)   return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <Sidebar onOpenSummary={() => setSummaryOpen(true)} />
      <main className="main-content">
        {children}
        {summaryOpen && <SummaryPdfModal onClose={() => setSummaryOpen(false)} />}
      </main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/notes"     element={<AppShell><NotesPage /></AppShell>} />
          <Route path="/schedule"  element={<AppShell><SchedulePage /></AppShell>} />
          <Route path="/tasks"     element={<AppShell><TasksPage /></AppShell>} />
          <Route path="/reminders" element={<AppShell><MedsPage /></AppShell>} />
          <Route path="*" element={<Navigate to="/notes" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
