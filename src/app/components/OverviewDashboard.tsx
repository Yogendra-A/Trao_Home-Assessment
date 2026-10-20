"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Plus, Clock, ChevronRight, ArrowRight } from "lucide-react";
import { Spinner, EmptyState, Skeleton, Badge } from "./ui";

type User = {
  id: string;
  email: string;
  createdAt: string;
};

type SavedKitItem = {
  id: string;
  title: string;
  company: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type OverviewDashboardProps = {
  user: User | null;
  onCreateKit: () => void;
  onOpenKit: (kitId: string) => void;
  onOpenAuth: () => void;
};

export function OverviewDashboard({ user, onCreateKit, onOpenKit, onOpenAuth }: OverviewDashboardProps) {
  const [kits, setKits] = useState<SavedKitItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch("/api/kits")
      .then((res) => (res.ok ? res.json() : { kits: [] }))
      .then((data) => setKits(data.kits || []))
      .catch(() => {})
      .finally(() => { setLoading(false); setLoaded(true); });
  }, [user]);

  const firstName = user?.email?.split("@")[0]?.split(".")[0] ?? "there";
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const recentKits = kits.slice(0, 6);
  const mostRecentKit = kits[0];

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Welcome header */}
      <div>
        <h1 style={{ marginBottom: "0.375rem" }}>
          {user ? `Welcome back, ${displayName}` : "Welcome to Trao"}
        </h1>
        <p style={{ color: "var(--text-2)", maxWidth: 520 }}>
          {user
            ? "Continue preparing for your next interview or create a new kit."
            : "Your AI-powered interview preparation platform. Turn any job description into a personalized prep kit."}
        </p>
      </div>

      {/* Primary CTA */}
      {!user ? (
        <div
          className="card"
          style={{
            background: "var(--accent-bg)",
            border: "1px solid rgba(79,70,229,0.2)",
            padding: "1.75rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 style={{ fontSize: "1.125rem", marginBottom: "0.375rem" }}>Get started</h2>
            <p style={{ color: "var(--text-2)", fontSize: "0.875rem", marginBottom: "1rem" }}>
              Create your first interview kit from any job description. No account needed to try it.
            </p>
            <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={onCreateKit}>
                <Plus size={16} />
                Create interview kit
              </button>
              <button className="btn btn-secondary" onClick={onOpenAuth}>
                Sign in to save kits
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "1.25rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={onCreateKit}
            style={{ width: "fit-content" }}
          >
            <Plus size={18} />
            New interview kit
          </button>
        </div>
      )}

      {/* Continue section */}
      {user && mostRecentKit && (
        <div>
          <div className="section-header">
            <div>
              <h3 className="section-title">Continue preparing</h3>
              <p className="section-desc">Pick up where you left off</p>
            </div>
          </div>

          <div
            className="card card-hover"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.25rem",
              cursor: "pointer",
              padding: "1.25rem 1.5rem",
            }}
            role="button"
            tabIndex={0}
            onClick={() => onOpenKit(mostRecentKit.id)}
            onKeyDown={(e) => e.key === "Enter" && onOpenKit(mostRecentKit.id)}
          >
            <div
              style={{
                width: 44, height: 44,
                background: "var(--accent-bg-strong)",
                color: "var(--accent)",
                borderRadius: "var(--r-md)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "1rem",
                flexShrink: 0,
              }}
            >
              {mostRecentKit.company?.charAt(0)?.toUpperCase() ?? "?"}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text)", marginBottom: "0.125rem" }}>
                {mostRecentKit.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", fontSize: "0.8125rem", color: "var(--text-3)" }}>
                <span>{mostRecentKit.company}</span>
                <span>·</span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                  <Clock size={12} />
                  Updated {new Date(mostRecentKit.updatedAt || mostRecentKit.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <ArrowRight size={18} style={{ color: "var(--text-3)", flexShrink: 0 }} />
          </div>
        </div>
      )}

      {/* Recent kits */}
      {user && (
        <div>
          <div className="section-header">
            <div>
              <h3 className="section-title">Interview kits</h3>
              <p className="section-desc">{kits.length} kit{kits.length !== 1 ? "s" : ""} saved</p>
            </div>
            {kits.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={onCreateKit}>
                <Plus size={14} />
                New kit
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="card" style={{ padding: "1rem 1.25rem" }}>
                  <div style={{ marginBottom: "0.5rem" }}><Skeleton height="1rem" width="60%" /></div>
                  <Skeleton height="0.75rem" width="40%" />
                </div>
              ))}
            </div>
          ) : recentKits.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<FolderOpen size={28} />}
                title="No kits yet"
                description="Create your first interview kit to start preparing for your next role."
                action={
                  <button className="btn btn-primary" onClick={onCreateKit}>
                    <Plus size={16} />
                    Create first kit
                  </button>
                }
              />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {recentKits.map((kit) => (
                <div
                  key={kit.id}
                  className="card card-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1rem 1.25rem",
                    cursor: "pointer",
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenKit(kit.id)}
                  onKeyDown={(e) => e.key === "Enter" && onOpenKit(kit.id)}
                >
                  <div
                    style={{
                      width: 36, height: 36,
                      background: "var(--surface-2)",
                      color: "var(--text-2)",
                      borderRadius: "var(--r-sm)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: "0.875rem",
                      flexShrink: 0,
                    }}
                  >
                    {kit.company?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)", marginBottom: "0.0625rem" }} className="truncate">
                      {kit.title}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-3)" }}>
                      {kit.company}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                      {new Date(kit.createdAt).toLocaleDateString()}
                    </span>
                    <Badge variant="status-ready">{kit.status || "ready"}</Badge>
                    <ChevronRight size={15} style={{ color: "var(--text-3)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Non-user: feature highlights */}
      {!user && (
        <div>
          <h3 className="section-title" style={{ marginBottom: "1rem" }}>How it works</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            {[
              {
                step: "1",
                title: "Paste a job description",
                desc: "Add the full JD text and the company website URL.",
              },
              {
                step: "2",
                title: "AI builds your kit",
                desc: "Trao researches the company, extracts requirements, and generates targeted questions.",
              },
              {
                step: "3",
                title: "Study and practice",
                desc: "Work through questions, revise flashcards, and follow your day-by-day schedule.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="card" style={{ display: "flex", gap: "0.875rem" }}>
                <div
                  style={{
                    width: 28, height: 28,
                    background: "var(--accent-bg-strong)",
                    color: "var(--accent)",
                    borderRadius: "var(--r-full)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: "0.875rem",
                    flexShrink: 0,
                  }}
                >
                  {step}
                </div>
                <div>
                  <h4 style={{ marginBottom: "0.25rem", fontSize: "0.9375rem" }}>{title}</h4>
                  <p style={{ fontSize: "0.875rem" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
