"use client";

import {
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  Zap,
  BarChart2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  LogOut,
  LogIn,
} from "lucide-react";

export type NavSection =
  | "overview"
  | "kits"
  | "schedule"
  | "practice"
  | "progress"
  | "settings"
  | "new-kit";

type NavItem = {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
  divider?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: "overview",  label: "Overview",          icon: <LayoutDashboard size={18} /> },
  { id: "kits",      label: "My Interview Kits",  icon: <FolderOpen size={18} /> },
  { id: "schedule",  label: "Study Plan",         icon: <CalendarDays size={18} /> },
  { id: "practice",  label: "Practice",           icon: <Zap size={18} /> },
  { id: "progress",  label: "Progress",           icon: <BarChart2 size={18} />, divider: true },
  { id: "settings",  label: "Settings",           icon: <Settings size={18} /> },
];

type User = {
  id: string;
  email: string;
  createdAt: string;
};

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  activeSection: NavSection;
  user: User | null;
  onNavigate: (section: NavSection) => void;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
};

export function Sidebar({
  collapsed,
  mobileOpen,
  activeSection,
  user,
  onNavigate,
  onToggleCollapse,
  onCloseMobile,
  onOpenAuth,
  onLogout,
}: SidebarProps) {
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "?";
  const displayName = user?.email?.split("@")[0] ?? "Guest";

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={onCloseMobile} aria-hidden="true" />
      )}

      <aside
        className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="sidebar-logo" title="Trao">
          <div className="sidebar-logo-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="sidebar-logo-text">Trao</span>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav" aria-label="Primary">
          {/* New Kit CTA */}
          <div className="sidebar-cta-wrap">
            <button
              className={`cta-new-kit ${activeSection === "new-kit" ? "active" : ""}`}
              onClick={() => onNavigate("new-kit")}
              aria-current={activeSection === "new-kit" ? "page" : undefined}
              title={collapsed ? "New Interview Kit" : undefined}
              aria-label="New Interview Kit"
            >
              <Plus size={18} style={{ flexShrink: 0 }} />
              <span className="nav-item-label">New Interview Kit</span>
            </button>
          </div>

          <div style={{ height: "0.25rem" }} />

          {NAV_ITEMS.map((item) => (
            <div key={item.id}>
              {item.divider && (
                <div className="nav-divider" />
              )}
              <button
                className={`nav-item ${activeSection === item.id ? "active" : ""}`}
                onClick={() => onNavigate(item.id)}
                aria-current={activeSection === item.id ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
              >
                {item.icon}
                <span className="nav-item-label">{item.label}</span>
              </button>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {user ? (
            <div className="sidebar-user-section">
              <div
                className="user-card"
                title={collapsed ? user.email : undefined}
                aria-label={user.email}
              >
                <div className="user-avatar" aria-hidden="true">{initials}</div>
                <div className="user-info">
                  <div className="user-name">{displayName}</div>
                  <div className="user-email">{user.email}</div>
                </div>
              </div>
              <button
                className="nav-item nav-logout-btn"
                onClick={onLogout}
                title={collapsed ? "Sign out" : undefined}
                aria-label="Sign out"
              >
                <LogOut size={16} />
                <span className="nav-item-label">Sign out</span>
              </button>
            </div>
          ) : (
            <button
              className="nav-item nav-login-btn"
              onClick={onOpenAuth}
              title={collapsed ? "Sign in / Register" : undefined}
              aria-label="Sign in / Register"
            >
              <LogIn size={16} />
              <span className="nav-item-label">Sign in / Register</span>
            </button>
          )}
        </div>

        {/* Collapse toggle (desktop) */}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>
    </>
  );
}
