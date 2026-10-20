"use client";

import { useState, useRef, useCallback } from "react";
import type { InterviewKit } from "../../shared/schemas/kit";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Tab = "overview" | "requirements" | "questions" | "flashcards" | "schedule";

type ApiError = { error: string; code: string };

type LoadingStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
};

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────

function difficultyLabel(n: number) {
  return n === 1 ? "Easy" : n === 2 ? "Medium" : "Hard";
}

function difficultyColor(n: number) {
  return n === 1 ? "#34d399" : n === 2 ? "#fbbf24" : "#f87171";
}

function totalMinutes(kit: InterviewKit): number {
  return kit.schedule.days.reduce((s, d) => s + d.minutes, 0);
}

// ─────────────────────────────────────────────
// Small atoms
// ─────────────────────────────────────────────

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin-smooth"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="rgba(167,139,250,0.25)"
        strokeWidth="3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="#a78bfa"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="#34d399"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`badge ${className ?? ""}`}>{children}</span>;
}

// ─────────────────────────────────────────────
// Loading overlay
// ─────────────────────────────────────────────

const LOADING_STEPS: Omit<LoadingStep, "done" | "active">[] = [
  { id: "url", label: "Validating company URL & DNS" },
  { id: "crawl", label: "Crawling company website" },
  { id: "requirements", label: "Extracting job requirements" },
  { id: "questions", label: "Generating interview questions" },
  { id: "coverage", label: "Running coverage recovery pass" },
  { id: "kit", label: "Building & validating your kit" },
];

function LoadingOverlay({ stepIndex }: { stepIndex: number }) {
  const steps: LoadingStep[] = LOADING_STEPS.map((s, i) => ({
    ...s,
    done: i < stepIndex,
    active: i === stepIndex,
  }));

  const pct = Math.min(100, Math.round(((stepIndex + 0.5) / LOADING_STEPS.length) * 100));

  return (
    <div
      className="glass animate-slide-up"
      style={{ padding: "2.5rem", maxWidth: 480, width: "100%", margin: "0 auto" }}
      role="status"
      aria-live="polite"
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", marginBottom: "1.8rem" }}>
        <Spinner size={28} />
        <div>
          <h2
            className="gradient-text"
            style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}
          >
            Generating Your Kit
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: 0 }}>
            This typically takes 30–90 seconds
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-track" style={{ marginBottom: "1.6rem" }}>
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Steps */}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {steps.map((step) => (
          <li
            key={step.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.7rem",
              fontSize: "0.9rem",
              color: step.done
                ? "var(--muted)"
                : step.active
                  ? "var(--foreground)"
                  : "rgba(160,160,200,0.3)",
              fontWeight: step.active ? 600 : 400,
              transition: "color 0.3s",
            }}
          >
            <span style={{ width: 20, display: "flex", justifyContent: "center" }}>
              {step.done ? (
                <CheckIcon />
              ) : step.active ? (
                <Spinner size={16} />
              ) : (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "rgba(120,80,255,0.25)",
                    display: "inline-block",
                  }}
                />
              )}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────
// Error card
// ─────────────────────────────────────────────

function ErrorCard({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  return (
    <div
      className="glass animate-slide-up"
      style={{
        padding: "2rem",
        maxWidth: 480,
        width: "100%",
        margin: "0 auto",
        borderColor: "rgba(244,63,94,0.35)",
      }}
      role="alert"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", marginBottom: "1rem" }}>
        <span style={{ fontSize: "1.4rem" }}>⚠️</span>
        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#fb7185" }}>
          Generation Failed
        </h3>
      </div>
      <p style={{ color: "var(--muted)", marginBottom: "0.5rem", fontSize: "0.92rem" }}>
        {error.error}
      </p>
      <p style={{ color: "rgba(120,80,255,0.6)", fontSize: "0.78rem", marginBottom: "1.5rem" }}>
        Code: <code style={{ fontFamily: "var(--font-geist-mono, monospace)" }}>{error.code}</code>
      </p>
      <button className="btn-primary" onClick={onRetry} style={{ width: "100%" }}>
        Try Again
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Kit result sections
// ─────────────────────────────────────────────

function OverviewSection({ kit }: { kit: InterviewKit }) {
  const mustCount = kit.role.requirements.filter((r) => r.priority === "must").length;
  const niceCount = kit.role.requirements.filter((r) => r.priority === "nice").length;
  const totalMins = totalMinutes(kit);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Source metadata */}
      <div
        className="glass"
        style={{ padding: "1.4rem 1.6rem" }}
      >
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Prep Kit Details
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {[
            { label: "Company", value: kit.source.company },
            { label: "Role", value: kit.source.role },
            { label: "Seniority", value: kit.role.seniority },
            { label: "Location", value: kit.source.location },
            { label: "JD Length", value: `${kit.source.jd_chars.toLocaleString()} chars` },
            { label: "Generated", value: new Date(kit.source.researched_at).toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.2rem" }}>{label}</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--foreground)", wordBreak: "break-word" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Company brief */}
      <div className="glass" style={{ padding: "1.4rem 1.6rem" }}>
        <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Company Brief
        </h3>
        <p style={{ color: "var(--foreground)", fontSize: "0.95rem", marginBottom: "0.75rem", lineHeight: 1.65 }}>
          {kit.company_brief.summary}
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", lineHeight: 1.65, marginBottom: "1rem" }}>
          {kit.company_brief.what_they_do}
        </p>
        {kit.company_brief.sources.length > 0 && (
          <div>
            <div style={{ fontSize: "0.72rem", color: "rgba(120,80,255,0.6)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Sources ({kit.company_brief.sources.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {kit.company_brief.sources.slice(0, 5).map((src) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.78rem", color: "var(--accent-light)", textDecoration: "none", wordBreak: "break-all" }}
                >
                  {src}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem" }}>
        {[
          { label: "Total Questions", value: kit.questions.length, icon: "❓", color: "var(--accent-light)" },
          { label: "Must-Have Reqs", value: mustCount, icon: "🎯", color: "#fb7185" },
          { label: "Nice-to-Have", value: niceCount, icon: "✨", color: "#34d399" },
          { label: "Flashcards", value: kit.flashcards.length, icon: "🃏", color: "#fbbf24" },
          { label: "Study Days", value: kit.schedule.days_available, icon: "📅", color: "#5eead4" },
          { label: "Total Minutes", value: totalMins, icon: "⏱️", color: "#c4b5fd" },
        ].map(({ label, value, icon, color }) => (
          <div
            key={label}
            className="glass card-hover"
            style={{ padding: "1.1rem", textAlign: "center" }}
          >
            <div style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>{icon}</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color, marginBottom: "0.2rem" }}>{value}</div>
            <div style={{ fontSize: "0.74rem", color: "var(--muted)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage info */}
      {kit.coverage.uncovered_requirement_ids.length > 0 && (
        <div
          className="glass"
          style={{ padding: "1rem 1.4rem", borderColor: "rgba(251,191,36,0.35)" }}
        >
          <p style={{ color: "#fcd34d", fontSize: "0.88rem", margin: 0 }}>
            ⚠️ <strong>{kit.coverage.uncovered_requirement_ids.length}</strong> nice-to-have requirement(s) have no questions. This is acceptable — all must-have requirements are covered.
          </p>
        </div>
      )}
    </div>
  );
}

function RequirementsSection({ kit }: { kit: InterviewKit }) {
  const must = kit.role.requirements.filter((r) => r.priority === "must");
  const nice = kit.role.requirements.filter((r) => r.priority === "nice");

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Role responsibilities */}
      <div className="glass" style={{ padding: "1.4rem 1.6rem" }}>
        <h3 style={{ margin: "0 0 0.9rem 0", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Responsibilities
        </h3>
        <ul style={{ margin: 0, padding: "0 0 0 1.2rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {kit.role.responsibilities.map((resp, i) => (
            <li key={i} style={{ color: "var(--foreground)", fontSize: "0.93rem", lineHeight: 1.6 }}>
              {resp}
            </li>
          ))}
        </ul>
      </div>

      {/* Must-haves */}
      {must.length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "0.82rem", fontWeight: 600, color: "#fb7185", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            🎯 Must-Have ({must.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {must.map((r) => (
              <div key={r.id} className="glass card-hover" style={{ padding: "0.9rem 1.2rem", display: "flex", alignItems: "flex-start", gap: "0.9rem" }}>
                <Badge className={`badge-${r.kind}`}>{r.kind}</Badge>
                <span style={{ fontSize: "0.93rem", color: "var(--foreground)", lineHeight: 1.55 }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nice-to-haves */}
      {nice.length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "0.82rem", fontWeight: 600, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            ✨ Nice-to-Have ({nice.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {nice.map((r) => (
              <div key={r.id} className="glass card-hover" style={{ padding: "0.9rem 1.2rem", display: "flex", alignItems: "flex-start", gap: "0.9rem" }}>
                <Badge className={`badge-${r.kind}`}>{r.kind}</Badge>
                <span style={{ fontSize: "0.93rem", color: "var(--muted)", lineHeight: 1.55 }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionsSection({ kit }: { kit: InterviewKit }) {
  const categories = ["technical", "behavioural", "system-design", "company-fit"] as const;
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all"
    ? kit.questions
    : kit.questions.filter((q) => q.category === filter);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Category filter */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          id="filter-all"
          className={`tab-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All ({kit.questions.length})
        </button>
        {categories.map((cat) => {
          const count = kit.questions.filter((q) => q.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              id={`filter-${cat}`}
              className={`tab-btn ${filter === cat ? "active" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1).replace("-", " ")} ({count})
            </button>
          );
        })}
      </div>

      {/* Questions list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        {filtered.map((q, i) => (
          <div key={q.id} className="glass card-hover" style={{ padding: "1.2rem 1.4rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.7rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>Q{i + 1}</span>
              <Badge className={`badge-${q.category}`}>{q.category.replace("-", " ")}</Badge>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginLeft: "auto" }}>
                {[1, 2, 3].map((d) => (
                  <span
                    key={d}
                    className="diff-dot"
                    style={{
                      background: d <= q.difficulty ? difficultyColor(q.difficulty) : "rgba(120,80,255,0.15)",
                    }}
                  />
                ))}
                <span style={{ fontSize: "0.72rem", color: "var(--muted)", marginLeft: "0.2rem" }}>
                  {difficultyLabel(q.difficulty)}
                </span>
              </div>
            </div>
            <p style={{ color: "var(--foreground)", fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.6rem", lineHeight: 1.55 }}>
              {q.prompt}
            </p>
            <details style={{ cursor: "pointer" }}>
              <summary style={{ color: "var(--accent-light)", fontSize: "0.8rem", fontWeight: 500, userSelect: "none" }}>
                Show answer outline
              </summary>
              <p style={{ color: "var(--muted)", fontSize: "0.88rem", lineHeight: 1.65, marginTop: "0.5rem", borderLeft: "2px solid rgba(124,58,237,0.4)", paddingLeft: "0.9rem" }}>
                {q.answer_outline}
              </p>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlashcardsSection({ kit }: { kit: InterviewKit }) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="animate-fade-in">
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
        Click a card to reveal the answer strategy.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
        {kit.flashcards.map((fc) => {
          const isFlipped = flipped.has(fc.id);
          return (
            <button
              key={fc.id}
              id={`flashcard-${fc.id}`}
              onClick={() => toggle(fc.id)}
              style={{
                cursor: "pointer",
                border: "none",
                background: "none",
                padding: 0,
                textAlign: "left",
              }}
              aria-pressed={isFlipped}
              aria-label={`Flashcard: ${fc.front}. ${isFlipped ? "Click to hide answer." : "Click to reveal answer."}`}
            >
              <div
                className="glass card-hover"
                style={{
                  padding: "1.3rem 1.4rem",
                  minHeight: 120,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                  borderColor: isFlipped ? "rgba(124,58,237,0.45)" : undefined,
                  background: isFlipped
                    ? "rgba(26,26,46,0.85)"
                    : "rgba(19,19,30,0.75)",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    {isFlipped ? "Answer Strategy" : "Prompt"}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--accent-light)" }}>
                    {isFlipped ? "↩ flip back" : "flip →"}
                  </span>
                </div>
                <p style={{
                  color: isFlipped ? "var(--muted)" : "var(--foreground)",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                  margin: 0,
                  flex: 1,
                }}>
                  {isFlipped ? fc.back : fc.front}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleSection({ kit }: { kit: InterviewKit }) {
  const questionMap = new Map(kit.questions.map((q) => [q.id, q]));
  const reqMap = new Map(kit.role.requirements.map((r) => [r.id, r]));

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="glass" style={{ padding: "1rem 1.4rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Study Duration</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--accent-light)" }}>
            {kit.schedule.days_available} days
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Total Study Time</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#5eead4" }}>
            {totalMinutes(kit)} min
          </div>
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Coverage Passes</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#fbbf24" }}>
            {kit.coverage.passes}
          </div>
        </div>
      </div>

      {kit.schedule.days.map((day) => {
        const qs = day.question_ids.map((id) => questionMap.get(id)).filter(Boolean);

        return (
          <div key={day.day} className="glass" style={{ padding: "1.2rem 1.4rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.7rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
              <span
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  color: "#fff",
                  borderRadius: "6px",
                  padding: "0.2rem 0.65rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                }}
              >
                Day {day.day}
              </span>
              <span style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--foreground)", flex: 1 }}>
                {day.focus}
              </span>
              <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                ⏱ {day.minutes} min
              </span>
            </div>

            {qs.length > 0 && (
              <ul style={{ margin: "0.6rem 0 0 0", padding: "0 0 0 1.1rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {qs.map((q) => {
                  if (!q) return null;
                  // Collect requirement text for the linked reqs
                  const reqTexts = q.requirement_ids
                    .map((rid) => reqMap.get(rid)?.text)
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(", ");

                  return (
                    <li key={q.id} style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
                      <Badge className={`badge-${q.category}`} >
                        {q.category.replace("-", " ")}
                      </Badge>
                      {" "}
                      <span style={{ color: "var(--foreground)" }}>{q.prompt.slice(0, 80)}{q.prompt.length > 80 ? "…" : ""}</span>
                      {reqTexts && (
                        <span style={{ fontSize: "0.75rem", color: "rgba(120,80,255,0.6)", marginLeft: "0.4rem" }}>
                          ({reqTexts.slice(0, 60)}{reqTexts.length > 60 ? "…" : ""})
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {qs.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0.4rem 0 0 0" }}>
                Review and consolidation day
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Result viewer
// ─────────────────────────────────────────────

function KitViewer({ kit, onReset }: { kit: InterviewKit; onReset: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "overview", label: "Overview", emoji: "🏠" },
    { id: "requirements", label: "Requirements", emoji: "📋" },
    { id: "questions", label: "Questions", emoji: "❓" },
    { id: "flashcards", label: "Flashcards", emoji: "🃏" },
    { id: "schedule", label: "Schedule", emoji: "📅" },
  ];

  return (
    <div
      className="animate-slide-up"
      style={{ width: "100%", maxWidth: 820, margin: "0 auto" }}
    >
      {/* Kit header */}
      <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0 0 0.3rem 0" }}>
            Interview Prep Kit for
          </p>
          <h1 className="gradient-text" style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
            {kit.role.title}
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0.25rem 0 0 0" }}>
            {kit.source.company}
            {kit.source.location !== "Not specified" && ` · ${kit.source.location}`}
          </p>
        </div>
        <button
          id="new-kit-btn"
          className="btn-primary"
          onClick={onReset}
          style={{ flexShrink: 0, padding: "0.6rem 1.2rem", fontSize: "0.88rem" }}
        >
          ← New Kit
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="glass"
        style={{ display: "flex", gap: "0.35rem", padding: "0.4rem", marginBottom: "1.5rem", flexWrap: "wrap" }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewSection kit={kit} />}
      {tab === "requirements" && <RequirementsSection kit={kit} />}
      {tab === "questions" && <QuestionsSection kit={kit} />}
      {tab === "flashcards" && <FlashcardsSection kit={kit} />}
      {tab === "schedule" && <ScheduleSection kit={kit} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Input form
// ─────────────────────────────────────────────

function InputForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (values: { jd: string; company_url: string; days: number }) => void;
  isLoading: boolean;
}) {
  const [jd, setJd] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState("7");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const jdRef = useRef<HTMLTextAreaElement>(null);

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!jd.trim()) errors.jd = "Please paste the job description.";
    else if (jd.length > 100_000) errors.jd = "Job description is too long (max 100,000 chars).";
    if (!url.trim()) errors.url = "Please enter the company website URL.";
    else {
      try {
        const parsed = new URL(url.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errors.url = "URL must use HTTP or HTTPS.";
        }
      } catch {
        errors.url = "Please enter a valid URL (e.g. https://example.com).";
      }
    }
    const d = parseInt(days, 10);
    if (isNaN(d) || d < 1 || d > 60) errors.days = "Days must be between 1 and 60.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [jd, url, days]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({ jd, company_url: url.trim(), days: parseInt(days, 10) });
  };

  return (
    <div
      className="glass animate-slide-up"
      style={{ width: "100%", maxWidth: 620, margin: "0 auto", padding: "2.2rem 2rem" }}
    >
      <form onSubmit={handleSubmit} noValidate aria-label="Interview kit generation form">
        {/* Job description */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            htmlFor="jd-input"
            style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.5rem" }}
          >
            Job Description <span style={{ color: "#fb7185" }}>*</span>
          </label>
          <textarea
            id="jd-input"
            ref={jdRef}
            className="form-input"
            rows={10}
            placeholder="Paste the full job description here…"
            value={jd}
            onChange={(e) => {
              setJd(e.target.value);
              if (fieldErrors.jd) setFieldErrors((p) => ({ ...p, jd: "" }));
            }}
            disabled={isLoading}
            style={{ resize: "vertical", minHeight: 180 }}
            aria-required="true"
            aria-describedby={fieldErrors.jd ? "jd-error" : undefined}
          />
          {jd.length > 0 && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.3rem" }}>
              {jd.length.toLocaleString()} / 100,000 characters
            </p>
          )}
          {fieldErrors.jd && (
            <p id="jd-error" style={{ color: "#fb7185", fontSize: "0.8rem", marginTop: "0.35rem" }} role="alert">
              {fieldErrors.jd}
            </p>
          )}
        </div>

        {/* Company URL */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            htmlFor="url-input"
            style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.5rem" }}
          >
            Company Website URL <span style={{ color: "#fb7185" }}>*</span>
          </label>
          <input
            id="url-input"
            type="url"
            className="form-input"
            placeholder="https://company.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (fieldErrors.url) setFieldErrors((p) => ({ ...p, url: "" }));
            }}
            disabled={isLoading}
            aria-required="true"
            aria-describedby={fieldErrors.url ? "url-error" : "url-hint"}
          />
          <p id="url-hint" style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.3rem" }}>
            The platform will crawl public pages to research the company.
          </p>
          {fieldErrors.url && (
            <p id="url-error" style={{ color: "#fb7185", fontSize: "0.8rem", marginTop: "0.35rem" }} role="alert">
              {fieldErrors.url}
            </p>
          )}
        </div>

        {/* Days */}
        <div style={{ marginBottom: "1.75rem" }}>
          <label
            htmlFor="days-input"
            style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.5rem" }}
          >
            Preparation Days <span style={{ color: "#fb7185" }}>*</span>
          </label>
          <input
            id="days-input"
            type="number"
            className="form-input"
            min={1}
            max={60}
            placeholder="7"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              if (fieldErrors.days) setFieldErrors((p) => ({ ...p, days: "" }));
            }}
            disabled={isLoading}
            aria-required="true"
            aria-describedby={fieldErrors.days ? "days-error" : "days-hint"}
            style={{ maxWidth: 150 }}
          />
          <p id="days-hint" style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.3rem" }}>
            Between 1 and 60 days. Questions will be spread across your schedule.
          </p>
          {fieldErrors.days && (
            <p id="days-error" style={{ color: "#fb7185", fontSize: "0.8rem", marginTop: "0.35rem" }} role="alert">
              {fieldErrors.days}
            </p>
          )}
        </div>

        <button
          id="generate-btn"
          type="submit"
          className="btn-primary"
          disabled={isLoading}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}
        >
          {isLoading ? (
            <>
              <Spinner size={18} />
              <span>Generating…</span>
            </>
          ) : (
            "✨ Generate Interview Kit"
          )}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
// Hero header
// ─────────────────────────────────────────────

function Hero() {
  return (
    <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
      {/* Logo mark */}
      <div style={{ marginBottom: "1.2rem" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            boxShadow: "0 0 32px rgba(124,58,237,0.45)",
            fontSize: "1.6rem",
          }}
        >
          🚀
        </span>
      </div>

      <h1
        className="gradient-text"
        style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 900, margin: "0 0 0.6rem 0", lineHeight: 1.1 }}
      >
        Trao Interview Prep
      </h1>
      <p
        style={{
          color: "var(--muted)",
          fontSize: "clamp(1rem, 2.5vw, 1.15rem)",
          maxWidth: 520,
          margin: "0 auto",
          lineHeight: 1.65,
        }}
      >
        Paste a job description and let AI craft a personalized prep kit — questions, flashcards, and a day-by-day study schedule.
      </p>

      {/* Feature badges */}
      <div
        style={{
          display: "flex",
          gap: "0.65rem",
          justifyContent: "center",
          flexWrap: "wrap",
          marginTop: "1.2rem",
        }}
      >
        {["Company Research", "Requirement Extraction", "Coverage Validation", "Study Schedule"].map((f) => (
          <span
            key={f}
            style={{
              background: "rgba(124,58,237,0.14)",
              border: "1px solid rgba(124,58,237,0.28)",
              color: "var(--accent-light)",
              borderRadius: 999,
              padding: "0.28rem 0.8rem",
              fontSize: "0.78rem",
              fontWeight: 500,
            }}
          >
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────

type PageState =
  | { phase: "input" }
  | { phase: "loading"; stepIndex: number }
  | { phase: "error"; error: ApiError }
  | { phase: "result"; kit: InterviewKit };

// Simulate step progression while waiting for the API response.
// The real pipeline steps run server-side; we just give the user
// visual feedback. Each step corresponds roughly to real phases.
const STEP_DURATION_MS = [3500, 12000, 4000, 8000, 3500, 4000];

export default function Home() {
  const [state, setState] = useState<PageState>({ phase: "input" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const advanceStep = (current: number) => {
    if (current >= LOADING_STEPS.length - 1) return;
    const next = current + 1;
    stepRef.current = next;
    setState((prev) =>
      prev.phase === "loading" ? { phase: "loading", stepIndex: next } : prev,
    );
    timerRef.current = setTimeout(() => advanceStep(next), STEP_DURATION_MS[next] ?? 5000);
  };

  const handleSubmit = async (values: { jd: string; company_url: string; days: number }) => {
    clearTimer();
    stepRef.current = 0;
    setState({ phase: "loading", stepIndex: 0 });

    // Start visual step progression
    timerRef.current = setTimeout(() => advanceStep(0), STEP_DURATION_MS[0] ?? 3500);

    try {
      const res = await fetch("/api/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      clearTimer();

      const data: unknown = await res.json();

      if (!res.ok) {
        const err = data as ApiError;
        setState({ phase: "error", error: err });
        return;
      }

      setState({ phase: "result", kit: data as InterviewKit });
    } catch {
      clearTimer();
      setState({
        phase: "error",
        error: {
          error: "Could not reach the server. Please check your connection and try again.",
          code: "NETWORK_ERROR",
        },
      });
    }
  };

  const handleRetry = () => {
    clearTimer();
    setState({ phase: "input" });
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "3rem 1.25rem 5rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background blobs */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-5%",
            width: "45vw",
            height: "45vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-5%",
            width: "40vw",
            height: "40vw",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(20,184,166,0.12) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 860 }}>
        {(state.phase === "input" || state.phase === "loading" || state.phase === "error") && (
          <Hero />
        )}

        {state.phase === "input" && (
          <InputForm onSubmit={handleSubmit} isLoading={false} />
        )}

        {state.phase === "loading" && (
          <LoadingOverlay stepIndex={state.stepIndex} />
        )}

        {state.phase === "error" && (
          <ErrorCard error={state.error} onRetry={handleRetry} />
        )}

        {state.phase === "result" && (
          <KitViewer kit={state.kit} onReset={handleRetry} />
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          position: "relative",
          zIndex: 1,
          marginTop: "3rem",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: "0.78rem",
        }}
      >
        <p>
          Trao Interview Prep · Powered by AI · Content sourced from public company pages and job descriptions only
        </p>
      </footer>
    </main>
  );
}
