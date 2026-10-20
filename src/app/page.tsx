"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { InterviewKit, Question, Flashcard } from "../../shared/schemas/kit";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Tab = "overview" | "questions" | "practice" | "schedule" | "builder";

type ApiError = { error: string; code: string };

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

type LoadingStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
};

// ─────────────────────────────────────────────
// Helpers
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
// Atoms
// ─────────────────────────────────────────────

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin-smooth inline-block"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="rgba(167,139,250,0.25)" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`badge ${className ?? ""}`}>{children}</span>;
}

// ─────────────────────────────────────────────
// Loading Overlay
// ─────────────────────────────────────────────

const LOADING_STEPS = [
  { id: "url", label: "Validating company URL & SSRF safety" },
  { id: "crawl", label: "Crawling company pages & public discussions" },
  { id: "requirements", label: "Extracting job requirements with stable IDs" },
  { id: "questions", label: "Generating questions by interview category" },
  { id: "coverage", label: "Running deterministic coverage recovery pass" },
  { id: "kit", label: "Allocating preparation schedule and saving kit" },
];

function LoadingOverlay({ stepIndex }: { stepIndex: number }) {
  const pct = Math.min(100, Math.round(((stepIndex + 0.5) / LOADING_STEPS.length) * 100));

  return (
    <div className="glass animate-slide-up" style={{ padding: "2.5rem", maxWidth: 500, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", marginBottom: "1.5rem" }}>
        <Spinner size={28} />
        <div>
          <h2 className="gradient-text" style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
            Generating Your Interview Kit
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: 0 }}>
            Executing research, extraction, generation, and coverage verification
          </p>
        </div>
      </div>

      <div className="progress-bar-track" style={{ marginBottom: "1.5rem" }}>
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {LOADING_STEPS.map((s, i) => (
          <li
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.7rem",
              fontSize: "0.88rem",
              color: i < stepIndex ? "var(--muted)" : i === stepIndex ? "var(--foreground)" : "rgba(160,160,200,0.3)",
              fontWeight: i === stepIndex ? 600 : 400,
            }}
          >
            <span style={{ width: 18, textAlign: "center" }}>
              {i < stepIndex ? "✓" : i === stepIndex ? <Spinner size={14} /> : "•"}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────
// Error Card
// ─────────────────────────────────────────────

function ErrorCard({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <div className="glass animate-slide-up" style={{ padding: "2rem", maxWidth: 500, width: "100%", margin: "0 auto", borderColor: "rgba(244,63,94,0.35)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", marginBottom: "0.8rem" }}>
        <span style={{ fontSize: "1.5rem" }}>⚠️</span>
        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#fb7185" }}>Generation Failed</h3>
      </div>
      <p style={{ color: "var(--muted)", marginBottom: "0.5rem", fontSize: "0.92rem" }}>{error.error}</p>
      <p style={{ color: "rgba(120,80,255,0.6)", fontSize: "0.78rem", marginBottom: "1.5rem" }}>
        Code: <code>{error.code}</code>
      </p>
      <button className="btn-primary" onClick={onRetry} style={{ width: "100%" }}>
        Try Again
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Auth Modal (Login / Register)
// ─────────────────────────────────────────────

function AuthModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Authentication failed.");
        setLoading(false);
        return;
      }

      onSuccess(data.user);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal-content animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ padding: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }} className="gradient-text">
            {mode === "login" ? "Sign In to Trao" : "Create an Account"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1.2rem" }}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <button className={`tab-btn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
            Sign In
          </button>
          <button className={`tab-btn ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>
            Register
          </button>
        </div>

        {error && (
          <div style={{ background: "rgba(244,63,94,0.15)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "0.7rem", marginBottom: "1rem", color: "#fb7185", fontSize: "0.85rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.3rem" }}>Email Address</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="developer@example.com"
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.3rem" }}>Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: "0.5rem" }}>
            {loading ? <Spinner size={16} /> : mode === "login" ? "Sign In" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Saved Kits Modal (Reopen Kit)
// ─────────────────────────────────────────────

function SavedKitsModal({
  isOpen,
  onClose,
  onSelectKit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectKit: (kitId: string) => void;
}) {
  const [kits, setKits] = useState<SavedKitItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch("/api/kits")
        .then((res) => (res.ok ? res.json() : { kits: [] }))
        .then((data) => setKits(data.kits || []))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal-content animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ padding: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }} className="gradient-text">
            Your Saved Interview Kits
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1.2rem" }}>
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <Spinner size={24} />
          </div>
        ) : kits.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>No kits saved yet. Generate a kit to save it to your account.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {kits.map((k) => (
              <div
                key={k.id}
                className="glass card-hover"
                style={{ padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{k.title}</div>
                  <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                    {k.company} · {new Date(k.updatedAt || k.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    onSelectKit(k.id);
                    onClose();
                  }}
                >
                  Reopen Kit →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Multi-Role Batch Upload Modal (Phase 5)
// ─────────────────────────────────────────────

function BatchUploadModal({
  isOpen,
  onClose,
  onResults,
}: {
  isOpen: boolean;
  onClose: () => void;
  onResults: (kits: InterviewKit[]) => void;
}) {
  const [fileContent, setFileContent] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setFileContent(event.target?.result as string);
      reader.readAsText(file);
    }
  };

  const handleRunBatch = async () => {
    try {
      const cases = JSON.parse(fileContent);
      if (!Array.isArray(cases) || cases.length === 0) {
        setStatus("JSON must contain an array of case objects with jd, company_url, days.");
        return;
      }

      setLoading(true);
      setStatus(`Processing ${cases.length} cases...`);

      const completedKits: InterviewKit[] = [];

      for (let i = 0; i < cases.length; i++) {
        const item = cases[i];
        setStatus(`Running case ${i + 1}/${cases.length}: ${item.id || item.company_url}...`);

        try {
          const res = await fetch("/api/kit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jd: item.jd,
              company_url: item.company_url,
              days: item.days || 5,
            }),
          });

          if (res.ok) {
            const kit = await res.json();
            completedKits.push(kit);
          }
        } catch {
          // Continue with next case
        }
      }

      setStatus(`Batch completed! ${completedKits.length} kits generated.`);
      if (completedKits.length > 0) {
        onResults(completedKits);
        onClose();
      }
    } catch {
      setStatus("Invalid JSON file format.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal-content animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ padding: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }} className="gradient-text">
            Prepare for Multiple Roles (Batch Upload)
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1.2rem" }}>
            ✕
          </button>
        </div>

        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
          Upload a JSON file containing an array of description-and-company pairs:
          <code style={{ display: "block", background: "rgba(10,10,18,0.7)", padding: "0.5rem", borderRadius: 6, marginTop: "0.4rem" }}>
            {`[ { "id": "role-1", "jd": "...", "company_url": "https://...", "days": 5 } ]`}
          </code>
        </p>

        <input type="file" accept=".json" onChange={handleFileChange} style={{ marginBottom: "1rem", color: "var(--foreground)" }} />

        {status && <div style={{ color: "var(--accent-light)", fontSize: "0.85rem", marginBottom: "1rem" }}>{status}</div>}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleRunBatch} disabled={loading || !fileContent}>
            {loading ? <Spinner size={16} /> : "Run Batch Preparation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Practice Mode (Phase 4)
// ─────────────────────────────────────────────

function PracticeModeSection({
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
  const currentCard: Flashcard | undefined = cards[currentIndex];

  const handleRate = async (confidence: "low" | "medium" | "high") => {
    if (!currentCard) return;

    const newRatings = { ...ratings, [currentCard.id]: confidence };
    const newCovered = new Set(covered).add(currentCard.id);

    setRatings(newRatings);
    setCovered(newCovered);

    // Persist to server if saved kit
    if (kitId) {
      try {
        await fetch(`/api/kits/${kitId}/practice`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confidenceRatings: { [currentCard.id]: confidence },
            coveredCardIds: [currentCard.id],
          }),
        });
      } catch {
        // Continue offline
      }
    }

    // Move to next card
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((p) => p + 1);
      setRevealed(false);
    }
  };

  if (cards.length === 0) {
    return <div className="glass" style={{ padding: "2rem", textAlign: "center" }}>No flashcards in this kit.</div>;
  }

  const coveredPercent = Math.round((covered.size / cards.length) * 100);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
      {/* Practice Header & Controls */}
      <div className="glass" style={{ padding: "1.2rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase" }}>Practice Progress</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-light)" }}>
            {covered.size} of {cards.length} covered ({coveredPercent}%)
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`tab-btn ${priorityMode === "normal" ? "active" : ""}`}
            onClick={() => {
              setPriorityMode("normal");
              setCurrentIndex(0);
              setRevealed(false);
            }}
          >
            Original Order
          </button>
          <button
            className={`tab-btn ${priorityMode === "low_confidence_first" ? "active" : ""}`}
            onClick={() => {
              setPriorityMode("low_confidence_first");
              setCurrentIndex(0);
              setRevealed(false);
            }}
          >
            Prioritize Low Confidence
          </button>
        </div>
      </div>

      {/* Progress Track */}
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${coveredPercent}%` }} />
      </div>

      {/* Flashcard Runner (One card at a time) */}
      {currentCard && (
        <div className="glass" style={{ padding: "2.5rem 2rem", minHeight: 260, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: "0.8rem", marginBottom: "1rem" }}>
              <span>Card {currentIndex + 1} of {cards.length}</span>
              {ratings[currentCard.id] && (
                <span style={{ color: ratings[currentCard.id] === "high" ? "#34d399" : ratings[currentCard.id] === "medium" ? "#fbbf24" : "#f87171" }}>
                  Rating: {ratings[currentCard.id].toUpperCase()}
                </span>
              )}
            </div>

            <h3 style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--foreground)", lineHeight: 1.5, margin: 0 }}>
              {currentCard.front}
            </h3>

            {revealed && (
              <div className="animate-fade-in" style={{ marginTop: "1.5rem", borderLeft: "3px solid var(--accent)", paddingLeft: "1rem" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--accent-light)", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.4rem" }}>
                  Answer Strategy
                </div>
                <p style={{ color: "var(--foreground)", fontSize: "0.95rem", lineHeight: 1.6, margin: 0 }}>
                  {currentCard.back}
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            {!revealed ? (
              <button className="btn-secondary" onClick={() => setRevealed(true)} style={{ width: "100%" }}>
                Reveal Answer Strategy 💡
              </button>
            ) : (
              <div style={{ display: "flex", gap: "0.6rem", width: "100%", justifyContent: "center" }}>
                <button className="btn-secondary" style={{ borderColor: "#f87171", color: "#f87171" }} onClick={() => handleRate("low")}>
                  Low Confidence
                </button>
                <button className="btn-secondary" style={{ borderColor: "#fbbf24", color: "#fbbf24" }} onClick={() => handleRate("medium")}>
                  Medium
                </button>
                <button className="btn-secondary" style={{ borderColor: "#34d399", color: "#34d399" }} onClick={() => handleRate("high")}>
                  High Confidence
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button
          className="btn-secondary btn-sm"
          disabled={currentIndex === 0}
          onClick={() => {
            setCurrentIndex((p) => p - 1);
            setRevealed(false);
          }}
        >
          ← Previous Card
        </button>
        <button
          className="btn-secondary btn-sm"
          disabled={currentIndex === cards.length - 1}
          onClick={() => {
            setCurrentIndex((p) => p + 1);
            setRevealed(false);
          }}
        >
          Next Card →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Interactive Builder & Result Viewer (Phase 3)
// ─────────────────────────────────────────────

function InteractiveBuilderSection({
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

  // Add Question State
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
    const updated: InterviewKit = {
      ...kit,
      company_brief: {
        ...kit.company_brief,
        [field]: value,
      },
    };
    onKitUpdate(updated);
  };

  const handleInlineEditQuestion = (qId: string, patch: Partial<Question>) => {
    const updatedQuestions = kit.questions.map((q) => (q.id === qId ? { ...q, ...patch } : q));
    onKitUpdate({ ...kit, questions: updatedQuestions });
  };

  const handleDeleteQuestion = (qId: string) => {
    const filtered = kit.questions.filter((q) => q.id !== qId);
    // Recalculate schedule question_ids
    const updatedSchedule = {
      ...kit.schedule,
      days: kit.schedule.days.map((d) => ({
        ...d,
        question_ids: d.question_ids.filter((id) => id !== qId),
      })),
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

    const updatedQuestions = [...kit.questions, customQuestion];
    // Add to Day 1 of schedule
    const updatedDays = kit.schedule.days.map((d, i) =>
      i === 0 ? { ...d, question_ids: [...d.question_ids, customQuestion.id] } : d,
    );

    onKitUpdate({
      ...kit,
      questions: updatedQuestions,
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
      setStatusMessage(`Successfully regenerated ${category ? `${category} questions` : section}! Preserved pinned edits.`);
    } catch {
      setStatusMessage("Network error during regeneration.");
    } finally {
      setRegenerating(null);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Status banner */}
      {statusMessage && (
        <div className="glass" style={{ padding: "0.8rem 1.2rem", borderColor: "var(--accent)" }}>
          <p style={{ margin: 0, color: "var(--accent-light)", fontSize: "0.9rem" }}>{statusMessage}</p>
        </div>
      )}

      {/* Company Brief Inline Editing */}
      <div className="glass" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
          <h3 style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)", textTransform: "uppercase" }}>
            Company Brief (Inline Editable)
          </h3>
          <button
            className="btn-secondary btn-sm"
            onClick={() => handleRegenerate("brief")}
            disabled={regenerating === "brief"}
          >
            {regenerating === "brief" ? <Spinner size={14} /> : "🔄 Regenerate Brief"}
          </button>
        </div>

        <label style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.2rem" }}>Summary</label>
        <textarea
          className="form-input"
          rows={3}
          value={kit.company_brief.summary}
          onChange={(e) => handleInlineEditBrief("summary", e.target.value)}
          style={{ marginBottom: "1rem" }}
        />

        <label style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.2rem" }}>What They Do</label>
        <textarea
          className="form-input"
          rows={3}
          value={kit.company_brief.what_they_do}
          onChange={(e) => handleInlineEditBrief("what_they_do", e.target.value)}
        />
      </div>

      {/* Questions Reshaping */}
      <div className="glass" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", flexWrap: "wrap", gap: "0.8rem" }}>
          <h3 style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)", textTransform: "uppercase" }}>
            Question Bank Builder ({kit.questions.length} questions)
          </h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["technical", "behavioural", "system-design", "company-fit"] as const).map((cat) => (
              <button
                key={cat}
                className="btn-secondary btn-sm"
                onClick={() => handleRegenerate("category", cat)}
                disabled={regenerating === `category_${cat}`}
              >
                {regenerating === `category_${cat}` ? <Spinner size={12} /> : `Regen ${cat.split("-")[0]}`}
              </button>
            ))}
            <button className="btn-primary btn-sm" onClick={() => setShowAddQuestion((p) => !p)}>
              + Add Question
            </button>
          </div>
        </div>

        {/* Add Question Modal / Panel */}
        {showAddQuestion && (
          <div className="glass" style={{ padding: "1.2rem", marginBottom: "1.2rem", border: "1px solid var(--accent)" }}>
            <h4 style={{ margin: "0 0 0.8rem 0", fontSize: "0.95rem", color: "var(--accent-light)" }}>Add Custom Question</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <input
                className="form-input"
                placeholder="Question prompt..."
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
              />
              <textarea
                className="form-input"
                placeholder="Answer outline / strategy..."
                rows={2}
                value={newOutline}
                onChange={(e) => setNewOutline(e.target.value)}
              />
              <div style={{ display: "flex", gap: "1rem" }}>
                <select
                  className="form-input"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value as Question["category"])}
                  style={{ width: "auto" }}
                >
                  <option value="technical">Technical</option>
                  <option value="behavioural">Behavioural</option>
                  <option value="system-design">System Design</option>
                  <option value="company-fit">Company Fit</option>
                </select>
                <select
                  className="form-input"
                  value={newDiff}
                  onChange={(e) => setNewDiff(parseInt(e.target.value, 10))}
                  style={{ width: "auto" }}
                >
                  <option value={1}>Easy (1)</option>
                  <option value={2}>Medium (2)</option>
                  <option value={3}>Hard (3)</option>
                </select>
                <button className="btn-primary btn-sm" onClick={handleAddQuestion}>
                  Save Question
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Questions list with Reordering, Pinning, Category Movement */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {kit.questions.map((q, idx) => {
            const isPinned = pinnedIds.has(q.id);
            return (
              <div key={q.id} className="glass" style={{ padding: "1.2rem", borderLeft: isPinned ? "3px solid #fbbf24" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>#{idx + 1}</span>
                    <select
                      className="form-input"
                      value={q.category}
                      onChange={(e) => handleInlineEditQuestion(q.id, { category: e.target.value as Question["category"] })}
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.78rem", width: "auto" }}
                    >
                      <option value="technical">Technical</option>
                      <option value="behavioural">Behavioural</option>
                      <option value="system-design">System Design</option>
                      <option value="company-fit">Company Fit</option>
                    </select>
                    <select
                      className="form-input"
                      value={q.difficulty}
                      onChange={(e) => handleInlineEditQuestion(q.id, { difficulty: parseInt(e.target.value, 10) as 1 | 2 | 3 })}
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.78rem", width: "auto" }}
                    >
                      <option value={1}>Easy</option>
                      <option value={2}>Medium</option>
                      <option value={3}>Hard</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => togglePin(q.id)}
                      style={{ color: isPinned ? "#fbbf24" : "var(--muted)" }}
                      title="Pinned questions survive section regenerations"
                    >
                      {isPinned ? "📌 Pinned" : "Pin"}
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      disabled={idx === 0}
                      onClick={() => handleMoveQuestion(idx, "up")}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      disabled={idx === kit.questions.length - 1}
                      onClick={() => handleMoveQuestion(idx, "down")}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleDeleteQuestion(q.id)}
                      style={{ color: "#f87171" }}
                      title="Delete question"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <input
                  className="form-input"
                  value={q.prompt}
                  onChange={(e) => handleInlineEditQuestion(q.id, { prompt: e.target.value })}
                  style={{ marginBottom: "0.6rem", fontWeight: 600 }}
                />

                <textarea
                  className="form-input"
                  rows={2}
                  value={q.answer_outline}
                  onChange={(e) => handleInlineEditQuestion(q.id, { answer_outline: e.target.value })}
                  style={{ fontSize: "0.88rem", color: "var(--muted)" }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Overview Section
// ─────────────────────────────────────────────

function OverviewSection({ kit }: { kit: InterviewKit }) {
  const mustCount = kit.role.requirements.filter((r) => r.priority === "must").length;
  const niceCount = kit.role.requirements.filter((r) => r.priority === "nice").length;
  const totalMins = totalMinutes(kit);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Kit Metadata */}
      <div className="glass" style={{ padding: "1.4rem 1.6rem" }}>
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
          Kit Details
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
          {[
            { label: "Company", value: kit.source.company },
            { label: "Role", value: kit.source.role },
            { label: "Seniority", value: kit.role.seniority },
            { label: "Location", value: kit.source.location },
            { label: "JD Length", value: `${kit.source.jd_chars.toLocaleString()} chars` },
            { label: "Generated", value: new Date(kit.source.researched_at).toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{label}</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--foreground)" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Company Brief */}
      <div className="glass" style={{ padding: "1.4rem 1.6rem" }}>
        <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
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
            <div style={{ fontSize: "0.72rem", color: "var(--accent-light)", marginBottom: "0.4rem", textTransform: "uppercase" }}>
              Sources ({kit.company_brief.sources.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {kit.company_brief.sources.slice(0, 5).map((src) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.78rem", color: "var(--accent-light)" }}>
                  {src}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "1rem" }}>
        {[
          { label: "Questions", value: kit.questions.length, icon: "❓", color: "var(--accent-light)" },
          { label: "Must-Have", value: mustCount, icon: "🎯", color: "#fb7185" },
          { label: "Nice-to-Have", value: niceCount, icon: "✨", color: "#34d399" },
          { label: "Flashcards", value: kit.flashcards.length, icon: "🃏", color: "#fbbf24" },
          { label: "Days", value: kit.schedule.days_available, icon: "📅", color: "#5eead4" },
          { label: "Total Time", value: `${totalMins}m`, icon: "⏱️", color: "#c4b5fd" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="glass card-hover" style={{ padding: "1.1rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.4rem", marginBottom: "0.3rem" }}>{icon}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: "0.74rem", color: "var(--muted)" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Questions Section
// ─────────────────────────────────────────────

function QuestionsSection({ kit }: { kit: InterviewKit }) {
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? kit.questions : kit.questions.filter((q) => q.category === filter);

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className={`tab-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          All ({kit.questions.length})
        </button>
        {(["technical", "behavioural", "system-design", "company-fit"] as const).map((cat) => {
          const count = kit.questions.filter((q) => q.category === cat).length;
          if (count === 0) return null;
          return (
            <button key={cat} className={`tab-btn ${filter === cat ? "active" : ""}`} onClick={() => setFilter(cat)}>
              {cat.replace("-", " ")} ({count})
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        {filtered.map((q, i) => (
          <div key={q.id} className="glass card-hover" style={{ padding: "1.2rem 1.4rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.7rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>Q{i + 1}</span>
              <Badge className={`badge-${q.category}`}>{q.category.replace("-", " ")}</Badge>
              <span style={{ fontSize: "0.75rem", color: difficultyColor(q.difficulty), marginLeft: "auto" }}>
                {difficultyLabel(q.difficulty)}
              </span>
            </div>
            <p style={{ color: "var(--foreground)", fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.6rem" }}>
              {q.prompt}
            </p>
            <details style={{ cursor: "pointer" }}>
              <summary style={{ color: "var(--accent-light)", fontSize: "0.8rem", fontWeight: 500 }}>Show answer strategy</summary>
              <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: "0.5rem", borderLeft: "2px solid var(--accent)", paddingLeft: "0.8rem" }}>
                {q.answer_outline}
              </p>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Schedule Section
// ─────────────────────────────────────────────

function ScheduleSection({ kit }: { kit: InterviewKit }) {
  const qMap = new Map(kit.questions.map((q) => [q.id, q]));

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {kit.schedule.days.map((day) => {
        const dayQs = day.question_ids.map((id) => qMap.get(id)).filter(Boolean);

        return (
          <div key={day.day} className="glass" style={{ padding: "1.2rem 1.4rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--accent-light)" }}>
                Day {day.day}: {day.focus}
              </span>
              <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>⏱ {day.minutes} min</span>
            </div>

            {dayQs.length > 0 ? (
              <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {dayQs.map((q) => (
                  <li key={q?.id} style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    <Badge className={`badge-${q?.category}`}>{q?.category.replace("-", " ")}</Badge>{" "}
                    <span style={{ color: "var(--foreground)" }}>{q?.prompt}</span>
                  </li>
                ))}
              </ul>
            ) : (
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
// Main Page App
// ─────────────────────────────────────────────

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [savedKitsOpen, setSavedKitsOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  // Form input state
  const [jd, setJd] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState("7");
  const [loadingStep, setLoadingStep] = useState(0);

  // Page view state
  const [phase, setPhase] = useState<"input" | "loading" | "error" | "result">("input");
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [currentKit, setCurrentKit] = useState<InterviewKit | null>(null);
  const [currentKitId, setCurrentKitId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Check auth session on load
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
  };

  const handleOpenSavedKit = async (kitId: string) => {
    try {
      const res = await fetch(`/api/kits/${kitId}`);
      if (res.ok) {
        const record = await res.json();
        setCurrentKit(record.kit);
        setCurrentKitId(record.id);
        setPhase("result");
        setActiveTab("overview");
      }
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jd.trim() || !url.trim()) return;

    setPhase("loading");
    setLoadingStep(0);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 4000);

    try {
      const endpoint = user ? "/api/kits" : "/api/kit";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jd: jd.trim(),
          company_url: url.trim(),
          days: parseInt(days, 10) || 5,
        }),
      });

      clearInterval(stepInterval);
      const data = await res.json();

      if (!res.ok) {
        setApiError(data as ApiError);
        setPhase("error");
        return;
      }

      // Handle response depending on whether saved record or direct kit
      const kit = data.kit || data;
      const kitId = data.id || data._id;

      setCurrentKit(kit as InterviewKit);
      setCurrentKitId(kitId);
      setPhase("result");
      setActiveTab("overview");
    } catch {
      clearInterval(stepInterval);
      setApiError({ error: "Could not reach the server.", code: "NETWORK_ERROR" });
      setPhase("error");
    }
  };

  const handleKitUpdate = async (updated: InterviewKit) => {
    setCurrentKit(updated);
    if (currentKitId && user) {
      try {
        await fetch(`/api/kits/${currentKitId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kit: updated }),
        });
      } catch {
        // Continue offline
      }
    }
  };

  return (
    <main style={{ minHeight: "100vh", padding: "1.5rem 1.25rem 4rem", maxWidth: 940, margin: "0 auto" }}>
      {/* Top Header / Navigation */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ fontSize: "1.6rem" }}>🚀</span>
          <span style={{ fontWeight: 800, fontSize: "1.2rem" }} className="gradient-text">
            Trao Interview Prep
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button className="btn-secondary btn-sm" onClick={() => setBatchModalOpen(true)}>
            📁 Batch Upload
          </button>

          {user ? (
            <>
              <button className="btn-secondary btn-sm" onClick={() => setSavedKitsOpen(true)}>
                📚 Saved Kits
              </button>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{user.email}</span>
              <button className="btn-secondary btn-sm" onClick={handleLogout}>
                Sign Out
              </button>
            </>
          ) : (
            <button className="btn-primary btn-sm" onClick={() => setAuthModalOpen(true)}>
              Sign In / Register
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      {phase === "input" && (
        <div className="animate-slide-up">
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h1 className="gradient-text" style={{ fontSize: "2.4rem", fontWeight: 900, margin: "0 0 0.5rem 0" }}>
              Personalized AI Interview Kit
            </h1>
            <p style={{ color: "var(--muted)", maxWidth: 520, margin: "0 auto" }}>
              Paste a job description and company website. The platform crawls the company, extracts requirements, verifies must-have coverage, and crafts an actionable prep kit.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="glass" style={{ padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Job Description <span style={{ color: "#fb7185" }}>*</span>
              </label>
              <textarea
                className="form-input"
                rows={8}
                placeholder="Paste the complete job description here..."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Company Website URL <span style={{ color: "#fb7185" }}>*</span>
              </label>
              <input
                type="url"
                className="form-input"
                placeholder="https://company.example"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Days Before Interview (1 to 60)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                className="form-input"
                style={{ width: 140 }}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: "100%" }}>
              ✨ Generate Interview Kit
            </button>
          </form>
        </div>
      )}

      {phase === "loading" && <LoadingOverlay stepIndex={loadingStep} />}

      {phase === "error" && apiError && (
        <ErrorCard error={apiError} onRetry={() => setPhase("input")} />
      )}

      {phase === "result" && currentKit && (
        <div className="animate-slide-up">
          {/* Kit Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h1 className="gradient-text" style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>
                {currentKit.role.title}
              </h1>
              <p style={{ color: "var(--muted)", margin: "0.2rem 0 0 0" }}>
                {currentKit.source.company} · {currentKit.source.location}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn-secondary btn-sm" onClick={() => window.print()}>
                🖨️ Print / Export PDF
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setPhase("input")}>
                + New Kit
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="glass no-print" style={{ display: "flex", gap: "0.3rem", padding: "0.4rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
            <button className={`tab-btn ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
              🏠 Overview
            </button>
            <button className={`tab-btn ${activeTab === "questions" ? "active" : ""}`} onClick={() => setActiveTab("questions")}>
              ❓ Questions ({currentKit.questions.length})
            </button>
            <button className={`tab-btn ${activeTab === "practice" ? "active" : ""}`} onClick={() => setActiveTab("practice")}>
              🃏 Practice Mode
            </button>
            <button className={`tab-btn ${activeTab === "schedule" ? "active" : ""}`} onClick={() => setActiveTab("schedule")}>
              📅 Study Schedule
            </button>
            <button className={`tab-btn ${activeTab === "builder" ? "active" : ""}`} onClick={() => setActiveTab("builder")}>
              🛠️ Interactive Builder
            </button>
          </div>

          {/* Tab Views */}
          {activeTab === "overview" && <OverviewSection kit={currentKit} />}
          {activeTab === "questions" && <QuestionsSection kit={currentKit} />}
          {activeTab === "practice" && <PracticeModeSection kit={currentKit} kitId={currentKitId} />}
          {activeTab === "schedule" && <ScheduleSection kit={currentKit} />}
          {activeTab === "builder" && (
            <InteractiveBuilderSection kit={currentKit} kitId={currentKitId} onKitUpdate={handleKitUpdate} />
          )}
        </div>
      )}

      {/* Modals */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} onSuccess={(u) => setUser(u)} />
      <SavedKitsModal isOpen={savedKitsOpen} onClose={() => setSavedKitsOpen(false)} onSelectKit={handleOpenSavedKit} />
      <BatchUploadModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onResults={(kits) => {
          if (kits.length > 0) {
            setCurrentKit(kits[0]);
            setPhase("result");
            setActiveTab("overview");
          }
        }}
      />
    </main>
  );
}
