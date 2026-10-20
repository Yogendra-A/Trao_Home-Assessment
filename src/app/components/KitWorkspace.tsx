"use client";

import { useState } from "react";
import {
  Building2, MapPin, Clock, ChevronDown, ChevronUp,
  Pin, Trash2, RotateCcw, Plus, ExternalLink, Printer,
  ArrowLeft,
} from "lucide-react";
import { Badge, Spinner, ProgressBar, EmptyState } from "./ui";
import type { InterviewKit, Question } from "../../../shared/schemas/kit";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function difficultyVariant(n: number): "easy" | "medium" | "hard" {
  return n === 1 ? "easy" : n === 2 ? "medium" : "hard";
}

function difficultyLabel(n: number) {
  return n === 1 ? "Easy" : n === 2 ? "Medium" : "Hard";
}

function totalMinutes(kit: InterviewKit): number {
  return kit.schedule.days.reduce((s, d) => s + d.minutes, 0);
}

// ─── Kit Header ───────────────────────────────────────────────────────────────

function KitHeaderBar({
  kit,
  onBack,
}: {
  kit: InterviewKit;
  onBack: () => void;
}) {
  const initial = kit.source.company?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <div className="kit-header" style={{ marginBottom: "1.5rem" }}>
      <div className="kit-company-logo" aria-hidden="true">{initial}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: "1.375rem", marginBottom: "0.125rem" }}>{kit.role.title}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.875rem", color: "var(--text-2)" }}>
            <Building2 size={13} />
            {kit.source.company}
          </span>
          {kit.source.location && (
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.875rem", color: "var(--text-3)" }}>
              <MapPin size={13} />
              {kit.source.location}
            </span>
          )}
          <Badge variant="status-ready">{kit.role.seniority}</Badge>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm no-print" onClick={onBack}>
          <ArrowLeft size={14} />
          New kit
        </button>
        <button className="btn btn-secondary btn-sm no-print" onClick={() => window.print()}>
          <Printer size={14} />
          Print
        </button>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ kit }: { kit: InterviewKit }) {
  const mustCount = kit.role.requirements.filter((r) => r.priority === "must").length;
  const niceCount = kit.role.requirements.filter((r) => r.priority === "nice").length;
  const totalMins = totalMinutes(kit);
  const uncoveredCount = kit.coverage.uncovered_requirement_ids.length;
  const coveragePct = Math.round(
    ((kit.role.requirements.length - uncoveredCount) / Math.max(1, kit.role.requirements.length)) * 100
  );

  const stats = [
    { label: "Questions",     value: kit.questions.length,          sub: "Interview questions" },
    { label: "Flashcards",    value: kit.flashcards.length,          sub: "For quick revision" },
    { label: "Days",          value: kit.schedule.days_available,    sub: "Study schedule" },
    { label: "Total time",    value: `${totalMins}m`,                sub: "Preparation time" },
  ];

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem" }}>
        {stats.map(({ label, value, sub }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            <div className="stat-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Company brief */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="section-header">
            <div>
              <h3 className="section-title">Company brief</h3>
              <p className="section-desc">Research summary used to tailor your questions</p>
            </div>
          </div>
          <p style={{ color: "var(--text-2)", marginBottom: "0.75rem", lineHeight: 1.7 }}>
            {kit.company_brief.summary}
          </p>
          <p style={{ color: "var(--text-3)", fontSize: "0.875rem", lineHeight: 1.7, marginBottom: kit.company_brief.sources.length > 0 ? "1rem" : 0 }}>
            {kit.company_brief.what_they_do}
          </p>
          {kit.company_brief.sources.length > 0 && (
            <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
              {kit.company_brief.sources.slice(0, 4).map((src) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", fontSize: "0.75rem", color: "var(--accent)" }}
                >
                  <ExternalLink size={11} />
                  {new URL(src).hostname}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Requirements */}
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="section-title">Requirements</h3>
              <p className="section-desc">{mustCount} must-have · {niceCount} nice-to-have</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: 240, overflowY: "auto" }}>
            {kit.role.requirements.map((req) => (
              <div key={req.id} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <Badge variant={req.priority === "must" ? "must" : "nice"}>{req.priority}</Badge>
                <span style={{ fontSize: "0.875rem", color: "var(--text-2)", lineHeight: 1.5 }}>{req.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Coverage */}
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="section-title">Coverage</h3>
              <p className="section-desc">{coveragePct}% of requirements addressed</p>
            </div>
          </div>
          <ProgressBar value={coveragePct} variant={coveragePct >= 80 ? "success" : "warning"} />
          <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "var(--text-2)" }}>
            <p>{kit.role.requirements.length - uncoveredCount} of {kit.role.requirements.length} requirements covered</p>
            {uncoveredCount > 0 && (
              <p style={{ color: "var(--warning)", marginTop: "0.25rem" }}>
                {uncoveredCount} requirement{uncoveredCount > 1 ? "s" : ""} without a dedicated question
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Kit metadata */}
      <div className="card">
        <div className="section-header">
          <h3 className="section-title">Kit details</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
          {[
            { label: "Generated",   value: new Date(kit.source.researched_at).toLocaleDateString() },
            { label: "JD length",   value: `${kit.source.jd_chars.toLocaleString()} characters` },
            { label: "Pages used",  value: `${kit.source.pages_used.length} company pages` },
            { label: "Coverage passes", value: kit.coverage.passes },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.25rem" }}>{label}</div>
              <div style={{ fontSize: "0.9375rem", color: "var(--text)" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Questions Tab ────────────────────────────────────────────────────────────

function QuestionsTab({ kit }: { kit: InterviewKit }) {
  const [filter, setFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = ["technical", "behavioural", "system-design", "company-fit"] as const;
  const filtered = filter === "all" ? kit.questions : kit.questions.filter((q) => q.category === filter);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Filter tabs */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
          <span className="tab-count">{kit.questions.length}</span>
        </button>
        {categories.map((cat) => {
          const count = kit.questions.filter((q) => q.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              className={`tab-btn ${filter === cat ? "active" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {cat.replace("-", " ")}
              <span className="tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Question list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {filtered.map((q, i) => {
          const isExpanded = expandedId === q.id;
          return (
            <div key={q.id} className="question-row">
              <div
                role="button"
                tabIndex={0}
                className="question-row-header"
                onClick={() => setExpandedId(isExpanded ? null : q.id)}
                onKeyDown={(e) => e.key === "Enter" || e.key === " " ? setExpandedId(isExpanded ? null : q.id) : undefined}
                aria-expanded={isExpanded}
              >
                <span style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 600, minWidth: "2ch" }}>
                  {i + 1}
                </span>
                <Badge variant={q.category as "technical" | "behavioural" | "system-design" | "company-fit"}>
                  {q.category.replace("-", " ")}
                </Badge>
                <span style={{ flex: 1, fontSize: "0.9375rem", fontWeight: 500, color: "var(--text)" }}>
                  {q.prompt}
                </span>
                <Badge variant={difficultyVariant(q.difficulty)}>
                  {difficultyLabel(q.difficulty)}
                </Badge>
                {isExpanded ? (
                  <ChevronUp size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                ) : (
                  <ChevronDown size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                )}
              </div>

              {isExpanded && (
                <div className="question-row-body animate-fade-in">
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent)", marginBottom: "0.5rem" }}>
                    Answer strategy
                  </p>
                  <p style={{ fontSize: "0.9rem", color: "var(--text-2)", lineHeight: 1.65 }}>
                    {q.answer_outline}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          title="No questions in this category"
          description="Questions for this category haven't been generated yet."
        />
      )}
    </div>
  );
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

function ScheduleTab({ kit }: { kit: InterviewKit }) {
  const qMap = new Map(kit.questions.map((q) => [q.id, q]));

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {kit.schedule.days.map((day) => {
        const dayQs = day.question_ids.map((id) => qMap.get(id)).filter(Boolean) as Question[];

        return (
          <div key={day.day} className="schedule-day">
            <div className="schedule-day-header">
              <div className="schedule-day-num">{day.day}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text)" }}>{day.focus}</span>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.8125rem", color: "var(--text-3)" }}>
                <Clock size={13} />
                {day.minutes} min
              </span>
            </div>

            {dayQs.length > 0 ? (
              <div className="schedule-day-body">
                {dayQs.map((q) => (
                  <div key={q.id} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.875rem" }}>
                    <Badge variant={q.category as "technical" | "behavioural" | "system-design" | "company-fit"}>
                      {q.category.replace("-", " ")}
                    </Badge>
                    <span style={{ color: "var(--text-2)", flex: 1, lineHeight: 1.5 }}>{q.prompt}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="schedule-day-body">
                <p style={{ fontSize: "0.875rem", color: "var(--text-3)" }}>Review and consolidation day</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Builder Tab ──────────────────────────────────────────────────────────────

function BuilderTab({
  kit,
  kitId,
  onKitUpdate,
}: {
  kit: InterviewKit;
  kitId?: string;
  onKitUpdate: (updated: InterviewKit) => void;
}) {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newOutline, setNewOutline] = useState("");
  const [newCat, setNewCat] = useState<Question["category"]>("technical");
  const [newDiff, setNewDiff] = useState(2);

  const togglePin = (qId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const handleInlineEditBrief = (field: "summary" | "what_they_do", value: string) => {
    onKitUpdate({ ...kit, company_brief: { ...kit.company_brief, [field]: value } });
  };

  const handleInlineEditQuestion = (qId: string, patch: Partial<Question>) => {
    const updatedQuestions = kit.questions.map((q) => (q.id === qId ? { ...q, ...patch } : q));
    onKitUpdate({ ...kit, questions: updatedQuestions });
  };

  const handleDeleteQuestion = (qId: string) => {
    const filtered = kit.questions.filter((q) => q.id !== qId);
    const updatedSchedule = {
      ...kit.schedule,
      days: kit.schedule.days.map((d) => ({ ...d, question_ids: d.question_ids.filter((id) => id !== qId) })),
    };
    onKitUpdate({ ...kit, questions: filtered, schedule: updatedSchedule });
  };

  const handleMoveQuestion = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= kit.questions.length) return;
    const reordered = [...kit.questions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    onKitUpdate({ ...kit, questions: reordered });
  };

  const handleAddQuestion = () => {
    if (!newPrompt.trim()) return;
    const firstReqId = kit.role.requirements[0]?.id || "r1";
    const customQuestion: Question = {
      id: `q_custom_${Date.now()}`,
      requirement_ids: [firstReqId],
      category: newCat,
      prompt: newPrompt.trim(),
      answer_outline: newOutline.trim() || "Prepared answer strategy.",
      difficulty: newDiff as 1 | 2 | 3,
    };
    const updatedDays = kit.schedule.days.map((d, i) =>
      i === 0 ? { ...d, question_ids: [...d.question_ids, customQuestion.id] } : d
    );
    onKitUpdate({
      ...kit,
      questions: [...kit.questions, customQuestion],
      schedule: { ...kit.schedule, days: updatedDays },
    });
    setNewPrompt("");
    setNewOutline("");
    setShowAddQuestion(false);
  };

  const handleRegenerate = async (section: "brief" | "category" | "schedule", category?: Question["category"]) => {
    if (!kitId) {
      setStatusMessage("Sign in and save this kit to use section-level regeneration.");
      return;
    }
    setRegenerating(category ? `category_${category}` : section);
    setStatusMessage("");
    try {
      const res = await fetch(`/api/kits/${kitId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, category }),
      });
      if (!res.ok) {
        const data = await res.json();
        setStatusMessage(data.error || "Regeneration failed.");
        return;
      }
      const updatedRecord = await res.json();
      onKitUpdate(updatedRecord.kit);
      setStatusMessage(`Regenerated ${category ? `${category} questions` : section}. Pinned questions preserved.`);
    } catch {
      setStatusMessage("Network error during regeneration.");
    } finally {
      setRegenerating(null);
    }
  };

  const categories = ["technical", "behavioural", "system-design", "company-fit"] as const;

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {statusMessage && (
        <div className="alert alert-success">{statusMessage}</div>
      )}

      {/* Company Brief editing */}
      <div className="card">
        <div className="section-header">
          <div>
            <h3 className="section-title">Company brief</h3>
            <p className="section-desc">Edit to refine AI-generated company context</p>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleRegenerate("brief")}
            disabled={regenerating === "brief"}
          >
            {regenerating === "brief" ? <Spinner size="sm" /> : <RotateCcw size={14} />}
            Regenerate
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div className="form-group">
            <label className="form-label">Summary</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={kit.company_brief.summary}
              onChange={(e) => handleInlineEditBrief("summary", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">What they do</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={kit.company_brief.what_they_do}
              onChange={(e) => handleInlineEditBrief("what_they_do", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Question bank */}
      <div className="card">
        <div className="section-header">
          <div>
            <h3 className="section-title">Question bank</h3>
            <p className="section-desc">{kit.questions.length} questions — edit, reorder, pin, or regenerate by category</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {categories.map((cat) => (
              <button
                key={cat}
                className="btn btn-ghost btn-sm"
                onClick={() => handleRegenerate("category", cat)}
                disabled={regenerating === `category_${cat}`}
              >
                {regenerating === `category_${cat}` ? <Spinner size="sm" /> : <RotateCcw size={12} />}
                {cat.split("-")[0]}
              </button>
            ))}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddQuestion((p) => !p)}
            >
              <Plus size={14} />
              Add question
            </button>
          </div>
        </div>

        {/* Add question panel */}
        {showAddQuestion && (
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--r-md)",
              padding: "1rem",
              marginBottom: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
            className="animate-slide-up"
          >
            <h4 style={{ color: "var(--accent)" }}>Add custom question</h4>
            <input
              className="form-input"
              placeholder="Question prompt…"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
            />
            <textarea
              className="form-textarea"
              placeholder="Answer outline / strategy…"
              rows={2}
              value={newOutline}
              onChange={(e) => setNewOutline(e.target.value)}
            />
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <select
                className="form-select"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value as Question["category"])}
                style={{ width: "auto", flex: 1 }}
              >
                <option value="technical">Technical</option>
                <option value="behavioural">Behavioural</option>
                <option value="system-design">System Design</option>
                <option value="company-fit">Company Fit</option>
              </select>
              <select
                className="form-select"
                value={newDiff}
                onChange={(e) => setNewDiff(parseInt(e.target.value, 10))}
                style={{ width: "auto" }}
              >
                <option value={1}>Easy</option>
                <option value={2}>Medium</option>
                <option value={3}>Hard</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleAddQuestion}>Save question</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddQuestion(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Questions list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {kit.questions.map((q, idx) => {
            const isPinned = pinnedIds.has(q.id);
            return (
              <div
                key={q.id}
                className="card"
                style={{
                  padding: "1rem",
                  borderLeft: isPinned ? "3px solid var(--warning)" : undefined,
                  background: "var(--surface-2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-3)", minWidth: "2ch" }}>#{idx + 1}</span>
                  <select
                    className="form-select"
                    value={q.category}
                    onChange={(e) => handleInlineEditQuestion(q.id, { category: e.target.value as Question["category"] })}
                    style={{ width: "auto", padding: "0.25rem 1.75rem 0.25rem 0.5rem", fontSize: "0.8125rem" }}
                  >
                    <option value="technical">Technical</option>
                    <option value="behavioural">Behavioural</option>
                    <option value="system-design">System Design</option>
                    <option value="company-fit">Company Fit</option>
                  </select>
                  <select
                    className="form-select"
                    value={q.difficulty}
                    onChange={(e) => handleInlineEditQuestion(q.id, { difficulty: parseInt(e.target.value, 10) as 1 | 2 | 3 })}
                    style={{ width: "auto", padding: "0.25rem 1.75rem 0.25rem 0.5rem", fontSize: "0.8125rem" }}
                  >
                    <option value={1}>Easy</option>
                    <option value={2}>Medium</option>
                    <option value={3}>Hard</option>
                  </select>

                  <div style={{ marginLeft: "auto", display: "flex", gap: "0.3rem" }}>
                    <button
                      className={`btn btn-icon btn-ghost btn-sm ${isPinned ? "" : ""}`}
                      onClick={() => togglePin(q.id)}
                      title="Pinned questions survive regeneration"
                      style={{ color: isPinned ? "var(--warning)" : undefined }}
                      aria-label={isPinned ? "Unpin" : "Pin"}
                    >
                      <Pin size={14} fill={isPinned ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="btn btn-icon btn-ghost btn-sm"
                      disabled={idx === 0}
                      onClick={() => handleMoveQuestion(idx, "up")}
                      aria-label="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      className="btn btn-icon btn-ghost btn-sm"
                      disabled={idx === kit.questions.length - 1}
                      onClick={() => handleMoveQuestion(idx, "down")}
                      aria-label="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      className="btn btn-icon btn-ghost btn-sm"
                      onClick={() => handleDeleteQuestion(q.id)}
                      style={{ color: "var(--danger)" }}
                      aria-label="Delete question"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <input
                  className="form-input"
                  value={q.prompt}
                  onChange={(e) => handleInlineEditQuestion(q.id, { prompt: e.target.value })}
                  style={{ marginBottom: "0.5rem", fontWeight: 600 }}
                />
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={q.answer_outline}
                  onChange={(e) => handleInlineEditQuestion(q.id, { answer_outline: e.target.value })}
                  style={{ fontSize: "0.875rem" }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main KitWorkspace Component ──────────────────────────────────────────────

type KitTab = "overview" | "questions" | "schedule" | "practice" | "builder";

type KitWorkspaceProps = {
  kit: InterviewKit;
  kitId?: string;
  onBack: () => void;
  onKitUpdate: (updated: InterviewKit) => void;
  initialRatings?: Record<string, "low" | "medium" | "high">;
  initialCovered?: string[];
};

export function KitWorkspace({
  kit,
  kitId,
  onBack,
  onKitUpdate,
  initialRatings,
  initialCovered,
}: KitWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<KitTab>("overview");

  const tabs: Array<{ id: KitTab; label: string; count?: number }> = [
    { id: "overview",   label: "Overview" },
    { id: "questions",  label: "Questions",  count: kit.questions.length },
    { id: "schedule",   label: "Study schedule" },
    { id: "practice",   label: "Practice",   count: kit.flashcards.length },
    { id: "builder",    label: "Edit & build" },
  ];

  return (
    <div className="animate-fade-in">
      <KitHeaderBar kit={kit} onBack={onBack} />

      {/* Tab navigation */}
      <div className="tab-nav no-print" style={{ marginBottom: "1.5rem" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
            {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab kit={kit} />}
      {activeTab === "questions" && <QuestionsTab kit={kit} />}
      {activeTab === "schedule" && <ScheduleTab kit={kit} />}
      {activeTab === "practice" && (
        <PracticeTab
          kit={kit}
          kitId={kitId}
          initialRatings={initialRatings}
          initialCovered={initialCovered}
        />
      )}
      {activeTab === "builder" && (
        <BuilderTab kit={kit} kitId={kitId} onKitUpdate={onKitUpdate} />
      )}
    </div>
  );
}

// ─── Practice Tab (inline here for access to kit types) ───────────────────────

function PracticeTab({
  kit,
  kitId,
  initialRatings,
  initialCovered,
}: {
  kit: InterviewKit;
  kitId?: string;
  initialRatings?: Record<string, "low" | "medium" | "high">;
  initialCovered?: string[];
}) {
  const [ratings, setRatings] = useState<Record<string, "low" | "medium" | "high">>(initialRatings || {});
  const [covered, setCovered] = useState<Set<string>>(new Set(initialCovered || []));
  const [revealed, setRevealed] = useState(false);
  const [priorityMode, setPriorityMode] = useState<"normal" | "low_confidence_first">("normal");

  const cards = [...kit.flashcards].sort((a, b) => {
    if (priorityMode === "low_confidence_first") {
      const score = (id: string) => {
        const r = ratings[id];
        if (r === "low") return 0;
        if (!r) return 1;
        if (r === "medium") return 2;
        return 3;
      };
      return score(a.id) - score(b.id);
    }
    return 0;
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentCard = cards[currentIndex];

  const handleRate = async (confidence: "low" | "medium" | "high") => {
    if (!currentCard) return;
    const newRatings = { ...ratings, [currentCard.id]: confidence };
    const newCovered = new Set(covered).add(currentCard.id);
    setRatings(newRatings);
    setCovered(newCovered);

    if (kitId) {
      try {
        await fetch(`/api/kits/${kitId}/practice`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confidenceRatings: { [currentCard.id]: confidence }, coveredCardIds: [currentCard.id] }),
        });
      } catch { /* continue offline */ }
    }

    if (currentIndex < cards.length - 1) {
      setCurrentIndex((p) => p + 1);
      setRevealed(false);
    }
  };

  if (cards.length === 0) {
    return (
      <EmptyState
        title="No flashcards available"
        description="This kit doesn't have any flashcards yet."
      />
    );
  }

  const coveredPercent = Math.round((covered.size / cards.length) * 100);
  const ratingForCurrent = currentCard ? ratings[currentCard.id] : null;

  const confidenceColors: Record<string, string> = {
    low:    "var(--danger)",
    medium: "var(--warning)",
    high:   "var(--success)",
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 680, margin: "0 auto" }}>
      {/* Controls header */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)", marginBottom: "0.25rem" }}>
            Progress
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>
            {covered.size} / {cards.length}
            <span style={{ fontSize: "0.875rem", color: "var(--text-3)", fontWeight: 400, marginLeft: "0.375rem" }}>
              cards covered
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          {(["normal", "low_confidence_first"] as const).map((mode) => (
            <button
              key={mode}
              className={`tab-btn ${priorityMode === mode ? "active" : ""}`}
              onClick={() => { setPriorityMode(mode); setCurrentIndex(0); setRevealed(false); }}
              style={{ fontSize: "0.8125rem" }}
            >
              {mode === "normal" ? "Original order" : "Low confidence first"}
            </button>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar
        value={coveredPercent}
        variant={coveredPercent >= 80 ? "success" : undefined}
      />

      {/* Flashcard */}
      {currentCard && (
        <div className="flashcard animate-scale-in">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-3)", marginBottom: "1rem" }}>
            <span>Card {currentIndex + 1} of {cards.length}</span>
            {ratingForCurrent && (
              <span style={{ color: confidenceColors[ratingForCurrent], fontWeight: 600 }}>
                {ratingForCurrent.charAt(0).toUpperCase() + ratingForCurrent.slice(1)} confidence
              </span>
            )}
          </div>

          <p className="flashcard-front">{currentCard.front}</p>

          {revealed && (
            <div className="flashcard-answer animate-fade-in">
              <div className="flashcard-answer-label">Answer strategy</div>
              <p className="flashcard-answer-text">{currentCard.back}</p>
            </div>
          )}

          <div style={{ marginTop: "1.5rem" }}>
            {!revealed ? (
              <button
                className="btn btn-secondary"
                onClick={() => setRevealed(true)}
                style={{ width: "100%" }}
              >
                Reveal answer strategy
              </button>
            ) : (
              <div style={{ display: "flex", gap: "0.625rem", justifyContent: "center" }}>
                <button
                  className="btn btn-sm"
                  onClick={() => handleRate("low")}
                  style={{
                    background: "var(--danger-bg)",
                    color: "var(--danger)",
                    border: "1px solid rgba(220,38,38,0.25)",
                    flex: 1,
                  }}
                >
                  Low
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => handleRate("medium")}
                  style={{
                    background: "var(--warning-bg)",
                    color: "var(--warning)",
                    border: "1px solid rgba(217,119,6,0.25)",
                    flex: 1,
                  }}
                >
                  Medium
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => handleRate("high")}
                  style={{
                    background: "var(--success-bg)",
                    color: "var(--success)",
                    border: "1px solid rgba(5,150,105,0.25)",
                    flex: 1,
                  }}
                >
                  High
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          className="btn btn-secondary btn-sm"
          disabled={currentIndex === 0}
          onClick={() => { setCurrentIndex((p) => p - 1); setRevealed(false); }}
        >
          ← Previous
        </button>
        <button
          className="btn btn-secondary btn-sm"
          disabled={currentIndex === cards.length - 1}
          onClick={() => { setCurrentIndex((p) => p + 1); setRevealed(false); }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
