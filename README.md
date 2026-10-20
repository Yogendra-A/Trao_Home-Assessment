# Trao Interview Preparation Platform

An AI-powered, end-to-end interview preparation platform. Paste a job description and company URL to receive a personalized kit containing:

- Extracted requirements (must-have / nice-to-have, with stable IDs)
- Technical, behavioural, system-design, and company-fit questions
- Coverage validation ensuring every must-have requirement is addressed
- Useful flashcards for active recall practice
- A day-by-day study schedule distributing all questions across your available time

---

## Architecture

```
src/app/                   ← Next.js App Router (frontend + API)
  page.tsx                 ← Main client-side UI (form, loading, results)
  layout.tsx               ← Root layout and metadata
  globals.css              ← Design system (dark theme, glassmorphism)
  api/kit/route.ts         ← POST /api/kit — pipeline entry point

server/src/pipeline/       ← Pipeline modules (run independently of Next.js)
  run.ts                   ← Orchestrator: wires all stages together
  research/                ← URL policy, SSRF protection, crawling, robots
  requirements/            ← JD parsing and requirement extraction (LLM)
  questions/               ← Question generation + bounded coverage loop
  generation/schedule.ts   ← Preparation schedule allocation
  validation/coverage.ts   ← Post-generation coverage check
  llm/chat-completions.ts  ← OpenAI-compatible LLM client (retries, timeout)

shared/schemas/kit.ts      ← Canonical Zod schema + InterviewKit type
server/tests/              ← Vitest test suite (12 files, 59 tests)
```

---

## Prerequisites

- Node.js 18+
- An OpenAI-compatible LLM provider (OpenAI, Azure OpenAI, local Ollama, etc.)

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template and fill in your values
cp .env.example .env
```

Edit `.env` with your provider credentials (see [Environment Variables](#environment-variables) below).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LLM_BASE_URL` | ✅ | OpenAI-compatible API base URL, e.g. `https://api.openai.com/v1` |
| `LLM_API_KEY` | ✅ | Your API key for the LLM provider |
| `LLM_MODEL` | ✅ | Model identifier, e.g. `gpt-4o`, `gpt-4-turbo`, `claude-3-5-sonnet-20241022` |
| `ALLOW_PRIVATE_URLS` | ❌ | Set to `true` to allow localhost/private-IP company URLs in **non-production** only (for evaluation with local test servers) |

> **Security**: Never commit a populated `.env` file. The `.gitignore` already excludes it. The LLM endpoint must use HTTPS unless it is `localhost`/`127.0.0.1`.

---

## Running the Application

```bash
# Development server (with hot reload)
npm run dev

# Production build
npm run build

# Start production server (after build)
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running Tests

```bash
npm test
# or in watch mode:
npm run test:watch
```

The test suite runs entirely with mocked LLM and HTTP calls — no live API keys required.

**Current status: 59/59 tests passing** across 12 test files covering:
- Schema validation
- URL/SSRF policy
- Company crawling and page fetching
- LLM client (retries, timeouts, malformed JSON)
- Requirements extraction
- Question generation and coverage loop
- Schedule allocation
- Pipeline orchestrator
- API route handler

---

## Batch Evaluation

```bash
npm run evaluate
```

Runs the pipeline against the test cases in `cases.json` using real LLM calls (requires `.env`).

---

## Linting

```bash
npm run lint
```

---

## Security Notes

- The URL safety policy (`server/src/pipeline/research/url-policy.ts`) validates all company URLs before DNS lookup and before fetching. It blocks private IPs, loopback addresses, credentials in URLs, and non-HTTP(S) protocols.
- Redirect chains are re-validated at each hop against the same policy to prevent DNS rebinding attacks.
- The crawler respects `robots.txt` and enforces per-origin rate limiting (500 ms between requests).
- LLM calls use bounded retries (3 attempts), timeouts (30 s per request), and exponential backoff.
- No user data is persisted server-side; the kit is returned directly in the HTTP response.

---

## Known Limitations

1. **Single-tenant, stateless**: No persistence layer. If the page is refreshed after generation, the kit is lost.
2. **Crawl depth**: The crawler fetches up to 12 pages per company. Deep or heavily JavaScript-rendered sites may yield limited evidence.
3. **LLM hallucinations**: The prompts instruct the model not to fabricate company facts, but LLM output is non-deterministic. Company briefs include source URLs so you can verify claims.
4. **Coverage guarantee is for must-have requirements only**: Nice-to-have requirements may have no questions if the coverage loop exhausts its passes.
5. **No streaming**: The entire kit is built server-side before being returned. Progress is simulated client-side. Generation typically takes 30–90 seconds.
6. **Rate limits**: Heavy LLM usage may trigger provider rate limits. The client retries with `Retry-After` header support.
