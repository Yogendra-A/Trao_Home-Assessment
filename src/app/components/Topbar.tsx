"use client";

import { Menu, Search, Plus } from "lucide-react";

type TopbarProps = {
  sidebarCollapsed: boolean;
  title: string;
  breadcrumb?: Array<{ label: string; active?: boolean }>;
  onToggleSidebar: () => void;
  onNewKit: () => void;
  extraActions?: React.ReactNode;
};

export function Topbar({
  sidebarCollapsed,
  title,
  breadcrumb,
  onToggleSidebar,
  onNewKit,
  extraActions,
}: TopbarProps) {
  return (
    <header
      className={`topbar ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      aria-label="Top navigation"
    >
      {/* Sidebar toggle */}
      <button
        className="topbar-toggle"
        onClick={onToggleSidebar}
        aria-label="Toggle navigation sidebar"
      >
        <Menu size={18} />
      </button>

      {/* Title / Breadcrumb */}
      <div className="topbar-breadcrumb" aria-label="Breadcrumb">
        {breadcrumb && breadcrumb.length > 1 ? (
          <>
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                {i > 0 && <span className="sep" aria-hidden="true">/</span>}
                <span className={`crumb ${crumb.active ? "active" : ""}`}>{crumb.label}</span>
              </span>
            ))}
          </>
        ) : (
          <span className="crumb active topbar-title">{title}</span>
        )}
      </div>

      {/* Actions */}
      <div className="topbar-actions">
        {extraActions}
        <button
          className="btn btn-primary btn-sm no-print"
          onClick={onNewKit}
          style={{ gap: "0.3rem" }}
        >
          <Plus size={14} />
          New Kit
        </button>
      </div>
    </header>
  );
}
