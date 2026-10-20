"use client";

import { useState, useEffect, useCallback } from "react";
import { Menu } from "lucide-react";
import type { InterviewKit } from "../../shared/schemas/kit";

import { Sidebar, type NavSection } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { AuthModal } from "./components/AuthModal";
import { KitCreator } from "./components/KitCreator";
import { KitWorkspace } from "./components/KitWorkspace";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { useToast } from "./components/ui/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type User = {
  id: string;
  email: string;
  createdAt: string;
};

// ─── Section metadata ─────────────────────────────────────────────────────────

const SECTION_TITLES: Record<NavSection, string> = {
  overview:  "Overview",
  kits:      "My Interview Kits",
  schedule:  "Study Plan",
  practice:  "Practice",
  progress:  "Progress",
  settings:  "Settings",
  "new-kit": "Create Interview Kit",
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const { toast } = useToast();

  // Auth
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Navigation
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Kit state
  const [currentKit, setCurrentKit] = useState<InterviewKit | null>(null);
  const [currentKitId, setCurrentKitId] = useState<string | undefined>(undefined);
  const [viewingKit, setViewingKit] = useState(false);

  // Check session on load
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setCurrentKit(null);
    setCurrentKitId(undefined);
    setViewingKit(false);
    toast("Signed out successfully", "success");
  };

  const handleAuthSuccess = (u: User) => {
    setUser(u);
    toast("Signed in successfully", "success");
  };

  const handleKitReady = useCallback((kit: InterviewKit, kitId?: string) => {
    setCurrentKit(kit);
    setCurrentKitId(kitId);
    setViewingKit(true);
    setActiveSection("kits");
    toast("Interview kit generated!", "success");
  }, [toast]);

  const handleKitUpdate = useCallback(async (updated: InterviewKit) => {
    setCurrentKit(updated);
    if (currentKitId && user) {
      try {
        await fetch(`/api/kits/${currentKitId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kit: updated }),
        });
        toast("Changes saved", "success");
      } catch {
        toast("Could not save changes", "error");
      }
    }
  }, [currentKitId, user, toast]);

  const handleOpenKit = useCallback(async (kitId: string) => {
    try {
      const res = await fetch(`/api/kits/${kitId}`);
      if (res.ok) {
        const record = await res.json();
        setCurrentKit(record.kit);
        setCurrentKitId(record.id);
        setViewingKit(true);
        setActiveSection("kits");
      }
    } catch {
      toast("Could not load kit", "error");
    }
  }, [toast]);

  const handleNavigate = (section: NavSection) => {
    if (section === "new-kit") {
      setViewingKit(false);
      setCurrentKit(null);
      setCurrentKitId(undefined);
      setActiveSection("new-kit");
    } else {
      setActiveSection(section);
      if (section !== "kits") {
        setViewingKit(false);
      }
    }
    setMobileSidebarOpen(false);
  };

  const handleBackFromKit = () => {
    setViewingKit(false);
    setCurrentKit(null);
    setCurrentKitId(undefined);
    setActiveSection("new-kit");
  };

  // Derive topbar breadcrumb
  const getBreadcrumb = () => {
    if (viewingKit && currentKit) {
      return [
        { label: "My Interview Kits" },
        { label: `${currentKit.source.company} — ${currentKit.role.title}`, active: true },
      ];
    }
    return [{ label: SECTION_TITLES[activeSection], active: true }];
  };

  // Main content renderer
  const renderContent = () => {
    // Viewing a specific kit workspace
    if (viewingKit && currentKit) {
      return (
        <KitWorkspace
          kit={currentKit}
          kitId={currentKitId}
          onBack={handleBackFromKit}
          onKitUpdate={handleKitUpdate}
        />
      );
    }

    // Section routing
    switch (activeSection) {
      case "overview":
        return (
          <OverviewDashboard
            user={user}
            onCreateKit={() => handleNavigate("new-kit")}
            onOpenKit={handleOpenKit}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        );

      case "new-kit":
        return (
          <KitCreator
            user={user}
            onKitReady={handleKitReady}
          />
        );

      case "kits":
        return (
          <OverviewDashboard
            user={user}
            onCreateKit={() => handleNavigate("new-kit")}
            onOpenKit={handleOpenKit}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        );

      case "schedule":
        return (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: "0.5rem" }}>Study Plan</h1>
            <p style={{ color: "var(--text-2)", marginBottom: "2rem" }}>
              Open an interview kit to view and follow your day-by-day schedule.
            </p>
            {user ? (
              <div className="card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: 480 }}>
                <p style={{ color: "var(--text-3)", fontSize: "0.9375rem" }}>
                  Select an interview kit from{" "}
                  <button
                    onClick={() => handleNavigate("kits")}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 600, padding: 0 }}
                  >
                    My Interview Kits
                  </button>{" "}
                  to see your schedule.
                </p>
              </div>
            ) : (
              <div className="card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: 480 }}>
                <p style={{ color: "var(--text-3)", fontSize: "0.9375rem", marginBottom: "1rem" }}>
                  Sign in to access your study plans and track progress.
                </p>
                <button className="btn btn-primary" onClick={() => setAuthModalOpen(true)}>Sign in</button>
              </div>
            )}
          </div>
        );

      case "practice":
        return (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: "0.5rem" }}>Practice</h1>
            <p style={{ color: "var(--text-2)", marginBottom: "2rem" }}>
              Open an interview kit and switch to the Practice tab to start a flashcard session.
            </p>
            <div className="card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: 480 }}>
              <p style={{ color: "var(--text-3)", fontSize: "0.9375rem" }}>
                Select an interview kit from{" "}
                <button
                  onClick={() => handleNavigate("kits")}
                  style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 600, padding: 0 }}
                >
                  My Interview Kits
                </button>{" "}
                to begin practicing.
              </p>
            </div>
          </div>
        );

      case "progress":
        return (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: "0.5rem" }}>Progress</h1>
            <p style={{ color: "var(--text-2)", marginBottom: "2rem" }}>
              Track your confidence ratings and coverage across all kits.
            </p>
            {!user && (
              <div className="card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: 480 }}>
                <p style={{ color: "var(--text-3)", fontSize: "0.9375rem", marginBottom: "1rem" }}>
                  Sign in to track your progress across sessions.
                </p>
                <button className="btn btn-primary" onClick={() => setAuthModalOpen(true)}>Sign in</button>
              </div>
            )}
          </div>
        );

      case "settings":
        return (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: "0.5rem" }}>Settings</h1>
            <p style={{ color: "var(--text-2)", marginBottom: "2rem" }}>
              Account and application preferences.
            </p>
            {user ? (
              <div className="card" style={{ maxWidth: 480 }}>
                <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border)" }}>
                  <h3 style={{ marginBottom: "1rem" }}>Account</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.25rem" }}>Email</div>
                      <div style={{ color: "var(--text)" }}>{user.email}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.25rem" }}>Member since</div>
                      <div style={{ color: "var(--text)" }}>{new Date(user.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
                <div style={{ padding: "1.25rem" }}>
                  <button className="btn btn-danger btn-sm" onClick={handleLogout}>Sign out</button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: 480 }}>
                <p style={{ color: "var(--text-3)", fontSize: "0.9375rem", marginBottom: "1rem" }}>
                  Sign in to manage your account.
                </p>
                <button className="btn btn-primary" onClick={() => setAuthModalOpen(true)}>Sign in</button>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        activeSection={activeSection}
        user={user}
        onNavigate={handleNavigate}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main area */}
      <div className={`app-main ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {/* Topbar */}
        <Topbar
          sidebarCollapsed={sidebarCollapsed}
          title={SECTION_TITLES[activeSection]}
          breadcrumb={getBreadcrumb()}
          onToggleSidebar={() => {
            // On mobile, toggle open/close; on desktop, toggle collapse
            if (window.innerWidth < 768) {
              setMobileSidebarOpen((p) => !p);
            } else {
              setSidebarCollapsed((p) => !p);
            }
          }}
          onNewKit={() => handleNavigate("new-kit")}
          extraActions={
            !user ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setAuthModalOpen(true)}
              >
                Sign in
              </button>
            ) : undefined
          }
        />

        {/* Content */}
        <main
          className={`main-content ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
          id="main-content"
          aria-label="Main content"
        >
          {renderContent()}
        </main>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
