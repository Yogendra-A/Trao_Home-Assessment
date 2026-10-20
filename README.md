# Trao AI Interview Preparation Platform
**Assessment ID**: `FS-AI-INTERVIEW-01`

An end-to-end full-stack web application and batch evaluation pipeline that turns a job description and company URL into a personalised, validated interview preparation kit — featuring company research, requirement extraction, category-separated questions with guaranteed must-have coverage, flashcards, practice mode, an interactive kit builder, and a day-by-day study schedule.

---

## Architecture & System Overview

```
src/app/                             ← Next.js 16 App Router (Frontend + Full-Stack API)
  page.tsx                           ← Interactive UI: paste form, batch upload, kit viewer, builder, practice mode
  globals.css                        ← Design system (dark theme, glassmorphism, responsive, print stylesheet)
  api/
    auth/                            ← Authentication endpoints (bcrypt + HTTP-only session cookies)
      register/route.ts              ← User registration (unique email index, bcrypt hash)
      login/route.ts                 ← Login with credentials verification
      logout/route.ts                ← Clear session cookie
      me/route.ts                    ← Session inspection
    kit/route.ts                     ← POST /api/kit — backward-compatible generation endpoint
    kits/route.ts                    ← GET (list user kits) & POST (generate & save kit)
    kits/[id]/route.ts               ← GET, PUT, DELETE with strict user ownership validation
    kits/[id]/practice/route.ts      ← Save flashcard confidence ratings and covered status
    kits/[id]/regenerate/route.ts    ← Section regeneration preserving pinned & edited questions
    health/route.ts                  ← Deployment health & database readiness check

server/src/
  auth/                              ← Password hashing (bcryptjs) & HMAC-SHA256 session token management
  db/                                ← Database abstraction layer (MongoDB with connection pooling + persistent fallback)
    client.ts                        ← MongoDB client connection pooling & index manager
    models.ts                        ← User and Kit document interfaces
    repository.ts                    ← User and Kit CRUD repository with strict scoping & ownership checks
  pipeline/                          ← Core generation & research pipeline
    run.ts                           ← Orchestrator: wires research, extraction, questions, schedule, validation
    research/
      url-policy.ts                  ← SSRF protection, DNS resolution, private IP filter, local fixture support
      fetch-page.ts                  ← HTTP fetcher: redirect validation, 1MB size limit, HTML parsing (Cheerio)
      crawl-company.ts               ← Domain crawler: 500ms pacing, link scoring (careers, engineering, about)
      robots-policy.ts               ← robots.txt parser & cache; graceful handling for local fixture servers
      search-discussions.ts          ← Public interview discussion search (Hacker News Algolia public API / custom search)
      research-company.ts            ← Aggregates domain crawl and public discussion insights
    requirements/
      extract.ts                     ← JD requirement extractor (stable IDs r_<hash>, kind, priority)
      generate-requirements.ts       ← LLM requirements caller
    questions/
      generate.ts                    ← Categorized generation conditioned on company research
      coverage-loop.ts               ← Deterministic second-pass coverage check and gap recovery
    generation/
      schedule.ts                    ← Deterministic arithmetic schedule allocator (front-loads harder material)
    validation/
      coverage.ts                    ← Post-generation referential integrity & must-have coverage verifier
    llm/
      chat-completions.ts            ← OpenAI/Groq compatible client: 3 retries, exponential backoff, 429 Retry-After
  cli/
    evaluate.ts                      ← Appendix B mandatory batch evaluation CLI

shared/schemas/kit.ts                ← Appendix A canonical Zod schema with full referential integrity checks
server/tests/                        ← 95 Vitest unit & integration tests across 14 test files
```

---

## Tech Stack & Justification

- **Frontend**: **Next.js 16** (App Router) with **Tailwind CSS**. Provides responsive, accessible, interactive UI with seamless server-side API integration.
- **Backend**: **Node.js** with modular TypeScript pipeline services and Next.js Route Handlers.
- **Database**: **MongoDB** (`mongodb` native driver with connection pooling, index management, and document persistence) with an automatic persistent repository fallback if a standalone MongoDB daemon is absent during local CLI evaluation.
- **Authentication**: **bcryptjs** (salt rounds: 10) password hashing with signed HTTP-only, SameSite cookies (`trao_session`).
- **LLM Provider**: Any OpenAI-compatible provider supporting JSON-mode (`response_format: { type: "json_object" }`). Works with **Groq** (`openai/gpt-oss-20b`, `llama-3.3-70b-versatile`), **OpenAI** (`gpt-4o`, `gpt-4o-mini`), or local **Ollama**.

---

## Setup & Running Locally

### 1. Prerequisites
- Node.js 18+
- npm or pnpm
- (Optional) Local MongoDB or MongoDB Atlas URI (if omitted, the persistent repository fallback handles local sessions automatically)

### 2. Installation
```bash
# Clone the repository
git clone <repo-url>
cd web-test

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

Edit `.env` to configure your LLM provider and database:
```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=your_llm_api_key_here
LLM_MODEL=openai/gpt-oss-20b
MONGODB_URI=mongodb://localhost:27017/trao
SESSION_SECRET=a-secure-random-secret-key-with-at-least-32-characters
ALLOW_PRIVATE_URLS=true
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Production Build & Start
```bash
npm run build
npm start
```

---

## Appendix B — Mandatory Batch Entry Point

The batch evaluation command processes an array of cases without using the web UI:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

### Example Input (`cases.json`):
```json
[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer\n\nRequired: Python, SQL and REST APIs.",
    "company_url": "https://example.com",
    "days": 5
  },
  {
    "id": "case-fixture",
    "jd": "Software Engineer\n\nRequired: Node.js and distributed systems.",
    "company_url": "http://localhost:8099/acme/",
    "days": 3
  }
]
```

### Evaluator Features & Conformance:
1. **Local Fixture Support**: Automatically enables local fixture URLs (`http://localhost:8099/...`) in evaluation mode without weakening production SSRF policies.
2. **Robots.txt Resilience**: Local fixture servers lacking `/robots.txt` or returning 404/500 are gracefully treated as unrestricted, while explicit crawl disallow rules on live sites continue to be strictly enforced.
3. **Semantic Error Codes**: Unreachable sites, DNS failures, or connection timeouts return structured errors matching Appendix B:
   ```json
   {
     "id": "case-04",
     "status": "failed",
     "kit": null,
     "error": {
       "code": "COMPANY_UNREACHABLE",
       "message": "Company site unreachable after 3 retries."
     }
   }
   ```
4. **Continuation on Failure**: An individual case failure does not abort the run; subsequent cases continue processing.
5. **Rate-Limit Resilience**: The LLM client intercepts HTTP 429 responses, parses provider `Retry-After` headers, and performs bounded exponential backoff to ensure completion within the assessment's 15-minute budget.

---

## Research & Generation Sequencing

The kit is constructed through a sequence of deliberate, non-trivial stages:

```mermaid
flowchart TD
    A["Job Description & Company URL"] --> B["URL Safety & SSRF Validation"]
    B --> C["Company Website Crawl (12 pages max, 500ms pacing)"]
    B --> D["Public Discussion Search (Hacker News Algolia API)"]
    C --> E["Extract Evidence (Hiring process, Engineering stack, About)"]
    D --> E
    A --> F["Deterministic Requirement Extraction (LLM, stable IDs r_hash, must/nice)"]
    E & F --> G["Category-Separated Question Generation (Technical, Behavioural, System Design, Company Fit)"]
    G --> H["Deterministic Coverage Check (Find uncovered must-haves)"]
    H -->|"Gaps found"| I["Targeted Second-Pass Question Generation"]
    I --> H
    H -->|"All must-haves covered"| J["Arithmetic Schedule Allocation (Front-loaded)"]
    J --> K["Flashcard Compilation & Referential Validation"]
    K --> L["Persist Kit to Database (Scoped to User)"]
```

1. **URL Safety & SSRF Policy**: Re-validates URLs at every redirect hop against loopback/private addresses in production.
2. **Company Site Crawl**: Discovers company hiring pages (`/careers`, `/jobs`, `/how-we-hire`) using keyword link scoring, respecting `robots.txt` and origin isolation.
3. **Public Discussion Search**: Gathers genuine interview feedback from public developer discussion boards (Hacker News Algolia public API or custom provider) without fabricating unverified claims.
4. **Requirement Extraction**: Parses the JD into distinct technical, behavioural, and domain requirements with stable sha256 IDs (`r_<hash>`).
5. **Research-Conditioned Question Generation**: Prompts are conditioned on discovered company hiring stages and engineering culture. Questions are generated in separate LLM calls per category (`technical`, `behavioural`, `system-design`, `company-fit`).
6. **Deterministic Coverage Loop**: Compares generated question requirement references against must-have requirements. If any must-have requirement lacks a question, a targeted second pass generates questions specifically for the gap.
7. **Schedule Allocation**: Distributes questions across the exact number of days requested using deterministic arithmetic (not handed to an LLM).
8. **Appendix A Schema Enforcement**: Canonical Zod validation verifies field names and referential integrity (ensuring every scheduled question and every flashcard links to existing IDs).

---

## The Interactive Builder: State Representation

Section 6 ("The Builder") requires making the kit reshapeable while preserving manual edits during section regeneration:

### Generated, Edited, and Pinned State Model
Each question and kit element maintains state tracking in the database:
- **`generated`**: Fresh content produced by the pipeline.
- **`edited`**: Content modified inline by the user (stored in `kitRecord.editedQuestions`).
- **`pinned`**: Content explicitly pinned by the user (stored in `kitRecord.pinnedQuestionIds`).
- **`custom`**: Questions or flashcards added by hand (stored in `kitRecord.customQuestionIds`).

### Section Regeneration Rules
- **Regenerate Company Brief**: Re-summarizes company evidence without touching role, questions, or schedule.
- **Regenerate Question Category**: When regenerating questions for a category (e.g. `technical`):
  1. All questions in other categories remain untouched.
  2. Within the target category, any question that is **pinned**, **manually edited**, or **custom-added** is preserved.
  3. Only unedited, non-pinned generated questions in that category are refreshed.
  4. The preparation schedule is automatically rebalanced to reflect the updated question set.
- **Regenerate Schedule**: Recalculates study distribution across requested days while preserving all current questions.

---

## Schedule Allocation Arithmetic

Implemented in `server/src/pipeline/generation/schedule.ts`:
- **Sorting**: Questions are ordered by must-have priority first (`0` vs `1`), then difficulty descending (`3` -> `2` -> `1`), then stable ID.
- **Front-Loading**: Sequential block allocation (`countForDay = Math.ceil(remainingQuestions / remainingDays)`) places the hardest and highest-priority material in earlier days (Days 1, 2...), leaving later days for lighter topics, review, and consolidation — ensuring high-difficulty topics do not land "the night before".
- **Integer Minutes**: Each day calculates duration deterministically based on assigned questions (`15 min` for difficulty 1, `25 min` for 2, `35 min` for 3).
- **Coverage Invariant**: Every must-have requirement is verified to appear in at least one scheduled question.

---

## Practice Mode (Section 7)

- **One Card at a Time**: Focused active-recall flashcard runner with "Reveal Answer Strategy".
- **Confidence Tracking**: Self-assessment buttons (*Low Confidence*, *Medium*, *High Confidence*).
- **Progress Tracking**: Real-time counter and progress bar tracking covered vs uncovered cards.
- **Confidence-Weighted Replay**: "Prioritize Low Confidence" sorts the session so cards marked with low confidence appear first for targeted review.
- **Persistence**: Ratings and covered status are persisted per user and kit via `PUT /api/kits/:id/practice`.

---

## Creative Value-Add Feature

- **Printable 1-Page Study Guide**: Integrated printable stylesheet (`@media print`) and export button that transforms the interactive kit into a formatted, high-density study one-pager suitable for offline interview prep or PDF export.

---

## Testing & Quality Assurance

Run the complete test suite:
```bash
npm test
```

### Current Status: 95/95 tests passing across 14 test files:
- `server/tests/schedule.test.ts` (6 tests): Requested day count, integer minutes, front-loading harder material, must-have coverage.
- `server/tests/auth-and-persistence.test.ts` (10 tests): bcrypt hashing, token signing/verification, duplicate email rejection, cross-user authorization, ownership isolation, edit persistence.
- `server/tests/schema.test.ts` (9 tests): Appendix A exact schema, difficulty range, integer durations, referential integrity, duplicate ID rejection.
- `server/tests/evaluate-cli.test.ts` (5 tests): Error classification (`COMPANY_UNREACHABLE`, `URL_REJECTED`, `COVERAGE_FAILED`).
- `server/tests/coverage.test.ts` (5 tests): Deterministic coverage checks.
- `server/tests/question-generation.test.ts` (5 tests): Category separation, coverage recovery loop.
- `server/tests/requirements.test.ts` (4 tests): Stable ID hashing, must/nice classification.
- `server/tests/url-policy.test.ts` (8 tests): SSRF protection, loopback blocking in production, protocol filtering.
- `server/tests/crawl-company.test.ts` (4 tests): robots.txt compliance, origin isolation, unreachable page handling.
- `server/tests/fetch-page.test.ts` (5 tests): Redirect validation, content-type filtering, payload limits.
- `server/tests/llm-client.test.ts` (17 tests): Provider 429 retries, exponential backoff, header delay parsing, malformed JSON recovery.
- `server/tests/pipeline-run.test.ts` (7 tests): Pipeline orchestrator, token bounding.
- `server/tests/api-route.test.ts` (9 tests): Route handler validation and error mapping.
- `server/tests/research-company.test.ts` (1 test): Evidence relevance ranking.

---

## Deployment Instructions

### Deploying to Vercel / Render / Fly.io:
1. Connect your repository to your hosting provider.
2. In the hosting dashboard, configure the Environment Variables:
   - `LLM_BASE_URL` (e.g. `https://api.groq.com/openai/v1`)
   - `LLM_API_KEY` (your LLM provider API key)
   - `LLM_MODEL` (e.g. `openai/gpt-oss-20b`)
   - `MONGODB_URI` (your MongoDB Atlas connection string, e.g. `mongodb+srv://user:pass@cluster.mongodb.net/trao?retryWrites=true&w=majority`)
   - `SESSION_SECRET` (random 32+ character string)
   - `NODE_ENV=production`
3. Build Command: `npm run build`
4. Start Command: `npm start`
5. Health Check: Navigate to `/api/health` to verify server uptime and database connectivity.
