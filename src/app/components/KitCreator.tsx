"use client";

import { useState } from "react";
import { FileText, Globe, Calendar, Upload, Check, ChevronRight } from "lucide-react";
import { Spinner, ProgressBar } from "./ui";
import type { InterviewKit } from "../../../shared/schemas/kit";

// ─── Loading Steps ────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  { id: "url",          label: "Validating company URL" },
  { id: "crawl",        label: "Crawling company pages" },
  { id: "requirements", label: "Extracting job requirements" },
  { id: "questions",    label: "Generating interview questions" },
  { id: "coverage",     label: "Running coverage verification" },
  { id: "kit",          label: "Building schedule and saving kit" },
];

function GenerationProgress({ stepIndex }: { stepIndex: number }) {
  const pct = Math.min(100, Math.round(((stepIndex + 0.5) / LOADING_STEPS.length) * 100));

  return (
    <div
      className="card animate-slide-up"
      style={{ maxWidth: 560, margin: "0 auto", padding: "2rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.5rem" }}>
        <div style={{
          width: 40, height: 40,
          borderRadius: "var(--r-md)",
          background: "var(--accent-bg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Spinner size="md" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
            Generating your interview kit
          </h3>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-3)", marginTop: "0.125rem" }}>
            Researching, extracting requirements, and crafting questions
          </p>
        </div>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <ProgressBar value={pct} />
      </div>

      <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        {LOADING_STEPS.map((step, i) => {
          const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "pending";
          return (
            <li key={step.id} className={`loading-step ${state}`}>
              <div className="loading-step-icon">
                {state === "done"   ? <Check size={10} strokeWidth={3} /> : null}
                {state === "active" ? <Spinner size="sm" /> : null}
              </div>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Error Card ───────────────────────────────────────────────────────────────

function ErrorState({
  message,
  code,
  onRetry,
}: {
  message: string;
  code: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="card animate-slide-up"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "2rem",
        borderColor: "rgba(220,38,38,0.25)",
      }}
    >
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
        <div style={{
          width: 36, height: 36,
          borderRadius: "var(--r-md)",
          background: "var(--danger-bg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "1rem" }}>⚠</span>
        </div>
        <div>
          <h3 style={{ margin: 0, color: "var(--danger)", fontSize: "1rem" }}>Generation failed</h3>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--text-2)" }}>{message}</p>
        </div>
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-3)", marginBottom: "1.25rem" }}>
        Error code: <code style={{ fontFamily: "var(--font-geist-mono, monospace)" }}>{code}</code>
      </p>
      <button className="btn btn-primary" onClick={onRetry} style={{ width: "100%" }}>
        Try again
      </button>
    </div>
  );
}

// ─── Batch Upload Modal ───────────────────────────────────────────────────────

function BatchModal({
  onClose,
  onResults,
}: {
  onClose: () => void;
  onResults: (kits: InterviewKit[]) => void;
}) {
  const [fileContent, setFileContent] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

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
      setStatus(`Processing ${cases.length} cases…`);
      const completedKits: InterviewKit[] = [];

      for (let i = 0; i < cases.length; i++) {
        const item = cases[i];
        setStatus(`Running case ${i + 1}/${cases.length}…`);
        try {
          const res = await fetch("/api/kit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jd: item.jd, company_url: item.company_url, days: item.days || 5 }),
          });
          if (res.ok) completedKits.push(await res.json());
        } catch { /* continue */ }
      }

      setStatus(`Done — ${completedKits.length} kits generated.`);
      if (completedKits.length > 0) { onResults(completedKits); onClose(); }
    } catch {
      setStatus("Invalid JSON file format.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Batch upload">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Batch preparation</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-2)" }}>
            Upload a JSON array with <code>jd</code>, <code>company_url</code>, and <code>days</code> per entry.
          </p>
          <pre style={{
            background: "var(--surface-2)",
            borderRadius: "var(--r-sm)",
            padding: "0.75rem",
            fontSize: "0.8125rem",
            color: "var(--text-2)",
            overflow: "auto",
          }}>
            {`[ { "jd": "...", "company_url": "https://...", "days": 5 } ]`}
          </pre>

          <div className="form-group">
            <label className="form-label">JSON file</label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              style={{ fontSize: "0.875rem", color: "var(--text-2)" }}
            />
          </div>

          {status && (
            <div className="alert alert-info">{status}</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleRunBatch}
            disabled={loading || !fileContent}
          >
            {loading ? <Spinner size="sm" /> : "Run batch"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main KitCreator Component ────────────────────────────────────────────────

type ApiError = { error: string; code: string };

type KitCreatorProps = {
  user: { id: string; email: string; createdAt: string } | null;
  onKitReady: (kit: InterviewKit, kitId?: string) => void;
};

export function KitCreator({ user, onKitReady }: KitCreatorProps) {
  const [jd, setJd] = useState("");
  const [url, setUrl] = useState("");
  const [days, setDays] = useState("7");
  const [phase, setPhase] = useState<"form" | "loading" | "error">("form");
  const [loadingStep, setLoadingStep] = useState(0);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jd.trim() || !url.trim()) return;

    setPhase("loading");
    setLoadingStep(0);

    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 4000);

    try {
      const endpoint = user ? "/api/kits" : "/api/kit";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd: jd.trim(), company_url: url.trim(), days: parseInt(days, 10) || 5 }),
      });

      clearInterval(interval);
      const data = await res.json();

      if (!res.ok) {
        setApiError(data as ApiError);
        setPhase("error");
        return;
      }

      const kit = data.kit || data;
      const kitId = data.id || data._id;
      onKitReady(kit as InterviewKit, kitId);
    } catch {
      clearInterval(interval);
      setApiError({ error: "Could not reach the server.", code: "NETWORK_ERROR" });
      setPhase("error");
    }
  };

  if (phase === "loading") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "3rem" }}>
        <GenerationProgress stepIndex={loadingStep} />
      </div>
    );
  }

  if (phase === "error" && apiError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "3rem" }}>
        <ErrorState
          message={apiError.error}
          code={apiError.code}
          onRetry={() => setPhase("form")}
        />
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      {/* Hero heading */}
      <div style={{ marginBottom: "2rem", maxWidth: 600 }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Create an interview kit</h1>
        <p style={{ color: "var(--text-2)", fontSize: "0.9375rem" }}>
          Paste a job description and company URL. Trao researches the company, extracts requirements, and builds a personalized prep kit with questions, flashcards, and a study schedule.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2.5rem", alignItems: "start" }}>
        {/* Main form */}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 640 }}
          noValidate
        >
          {/* Job Description */}
          <div className="form-group">
            <label className="form-label" htmlFor="jd-input">
              <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <FileText size={15} style={{ color: "var(--text-3)" }} />
                Job description
                <span className="input-required" aria-label="required">*</span>
              </span>
            </label>
            <p className="form-hint">
              Paste the complete job description including role, responsibilities, and requirements.
            </p>
            <textarea
              id="jd-input"
              className="form-textarea"
              rows={9}
              placeholder="Paste the full job description here…"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              required
              style={{ marginTop: "0.375rem" }}
            />
          </div>

          {/* Company URL + Days */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "1rem", alignItems: "end" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="url-input">
                <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <Globe size={15} style={{ color: "var(--text-3)" }} />
                  Company website
                  <span className="input-required" aria-label="required">*</span>
                </span>
              </label>
              <p className="form-hint">Used to research the company and tailor questions.</p>
              <input
                id="url-input"
                type="url"
                className="form-input"
                placeholder="https://company.example"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                style={{ marginTop: "0.375rem" }}
              />
            </div>

            <div className="form-group" style={{ maxWidth: 130 }}>
              <label className="form-label" htmlFor="days-input">
                <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <Calendar size={15} style={{ color: "var(--text-3)" }} />
                  Days
                </span>
              </label>
              <p className="form-hint">Until your interview.</p>
              <input
                id="days-input"
                type="number"
                min={1}
                max={60}
                className="form-input"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                style={{ marginTop: "0.375rem" }}
              />
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", paddingTop: "0.25rem" }}>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={!jd.trim() || !url.trim()}
            >
              Generate interview kit
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setBatchOpen(true)}
              title="Upload multiple roles at once"
            >
              <Upload size={15} />
              Batch upload
            </button>
          </div>

          {!user && (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-3)" }}>
              Sign in to save your kits and track progress across sessions.
            </p>
          )}
        </form>

        {/* Info panel */}
        <aside
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: "1.25rem",
            minWidth: 220,
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <h4 style={{ margin: 0, fontSize: "0.875rem", color: "var(--text)" }}>What you get</h4>
          {[
            { icon: "❓", text: "Categorized interview questions" },
            { icon: "🃏", text: "Flashcards for quick revision" },
            { icon: "📅", text: "Day-by-day study schedule" },
            { icon: "✅", text: "Requirement coverage analysis" },
          ].map(({ icon, text }) => (
            <div
              key={text}
              style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", fontSize: "0.875rem" }}
            >
              <span style={{ fontSize: "1rem", lineHeight: 1.4 }}>{icon}</span>
              <span style={{ color: "var(--text-2)", lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </aside>
      </div>

      {batchOpen && (
        <BatchModal
          onClose={() => setBatchOpen(false)}
          onResults={(kits) => {
            if (kits.length > 0) onKitReady(kits[0]);
          }}
        />
      )}
    </div>
  );
}
