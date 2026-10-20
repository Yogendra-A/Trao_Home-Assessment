// Shared UI primitives
import React from "react";

// ─── Spinner ─────────────────────────────────────────

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`spinner spinner-${size}`}
      role="status"
      aria-label="Loading"
    />
  );
}

// ─── Badge ───────────────────────────────────────────

type BadgeVariant =
  | "technical"
  | "behavioural"
  | "system-design"
  | "company-fit"
  | "domain"
  | "easy"
  | "medium"
  | "hard"
  | "must"
  | "nice"
  | "status-ready";

export function Badge({
  variant,
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`badge ${variant ? `badge-${variant}` : ""} ${className ?? ""}`}>
      {children}
    </span>
  );
}

// ─── Progress Bar ─────────────────────────────────────

export function ProgressBar({
  value,
  max = 100,
  variant,
  className,
  style,
}: {
  value: number;
  max?: number;
  variant?: "success" | "warning";
  className?: string;
  style?: React.CSSProperties;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={`progress-track ${className ?? ""}`} style={style} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`progress-fill ${variant ? variant : ""}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {description && <p className="empty-desc">{description}</p>}
      {action}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────

export function Skeleton({
  width,
  height = "1em",
  className,
  style,
}: {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`skeleton ${className ?? ""}`}
      style={{
        display: "block",
        width: width ?? "100%",
        height,
        borderRadius: "var(--r-sm)",
        ...style,
      }}
    />
  );
}

// ─── Alert ────────────────────────────────────────────

export function Alert({
  variant = "info",
  children,
}: {
  variant?: "info" | "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  return <div className={`alert alert-${variant}`}>{children}</div>;
}
