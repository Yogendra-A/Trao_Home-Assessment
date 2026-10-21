# Trao — Safe Cleanup & Refactoring Audit

**Date:** 2026-10-21  
**Repository:** `E:\Projects\Trao\web-test`  
**Specification:** `software-engineer-assignment(2).pdf`

---

## Executive Summary

This audit catalogs and classifies all non-essential code, unused dependencies, redundant abstractions, empty directories, and temporary artifacts across the repository. In accordance with user directives, **no code has been altered, refactored, or deleted**.

All findings below are classified with explicit **Evidence**, **Affected Files**, **Proposed Action**, **Risk Assessment**, and **Required Regression Tests**.

---

## Category 1: Confirmed Unused Files or Dead Code

### CLN-01: Empty Server Subdirectories (`server/src/api/`, `server/src/middleware/`, `server/src/services/`)
- **Category:** Confirmed Unused Files / Dead Directories
- **Evidence:**
  - `dir /s /b server\src\api`, `server\src\middleware`, and `server\src\services` all return 0 files.
  - The application architecture was originally planned as a standalone Express server, but was implemented using Next.js 16 App Router route handlers (`src/app/api/*`).
  - No files import or reference these directories.
- **Affected Paths:**
  - `server/src/api/`
  - `server/src/middleware/`
  - `server/src/services/`
- **Proposed Change:** Safely remove these three empty directory stubs from the filesystem.
- **Risk:** **Zero**. No imports or scripts reference them.
- **Tests Required:** Run `npm run build` and `npm test` to verify zero regression.

---

## Category 2: Duplicate Logic That Can Be Consolidated

### CLN-02: `RequestSchema` Zod Validation Duplication
- **Category:** Duplicate Logic
- **Evidence:**
  - In `src/app/api/kit/route.ts` (lines 9–13):
    ```ts
    const RequestSchema = z.object({
      jd: z.string().min(1, "Job description is required."),
      company_url: z.string().min(1, "Company URL is required."),
      days: z.number().int().min(1).max(60),
    });
    ```
  - In `src/app/api/kits/route.ts` (lines 10–14):
    ```ts
    const RequestSchema = z.object({
      jd: z.string().min(1, "Job description is required."),
      company_url: z.string().min(1, "Company URL is required."),
      days: z.number().int().min(1).max(60),
    });
    ```
  - Both route handlers validate identical incoming parameters (`jd`, `company_url`, `days`).
- **Affected Files:**
  - `src/app/api/kit/route.ts`
  - `src/app/api/kits/route.ts`
  - `shared/schemas/kit.ts` (ideal common location)
- **Proposed Change:**
  - Export `KitGenerationRequestSchema` from `shared/schemas/kit.ts`.
  - Import and use `KitGenerationRequestSchema` in both `src/app/api/kit/route.ts` and `src/app/api/kits/route.ts`.
- **Risk:** **Low**. The schemas are identical.
- **Tests Required:** `server/tests/api-route.test.ts` and `npm test`.

---

## Category 3: Functions That Should Be Reused Instead of Reimplemented

### CLN-03: API Error Translation & HTTP Status Code Mapping
- **Category:** Reusable Utility Opportunity
- **Evidence:**
  - `src/app/api/kit/route.ts` contains `userFacingMessage(error: unknown)` which categorizes `UrlPolicyError`, `LlmError`, `z.ZodError`, and general errors.
  - `src/app/api/kits/route.ts` handles errors separately with inline `if (error instanceof UrlPolicyError)` and `if (error instanceof LlmError)` blocks without standardizing validation errors.
  - Both endpoints serve generation logic and should return uniform error payloads (`{ error: string, code: string }`).
- **Affected Files:**
  - `src/app/api/kit/route.ts`
  - `src/app/api/kits/route.ts`
- **Proposed Change:**
  - Extract `handleApiError(error: unknown): Response` to a shared helper (e.g., `server/src/api/error-handler.ts` or `src/lib/api-errors.ts`).
  - Standardize error responses across both `/api/kit` and `/api/kits`.
- **Risk:** **Low**. Requires ensuring status codes (400, 422, 429, 500) match the exact specifications required by Section 8 and Section 10.
- **Tests Required:** `server/tests/api-route.test.ts`.

---

## Category 4: Unnecessary Dependencies or Scripts

### CLN-04: Legacy Express & Server-Related NPM Packages
- **Category:** Unnecessary Dependencies
- **Evidence:**
  - `package.json` contains:
    - `"express": "^5.3.0"`
    - `"express-session": "^1.19.0"`
    - `"connect-mongo": "^6.0.0"`
    - `"helmet": "^8.3.0"`
    - `"cors": "^2.8.6"`
    - `"supertest": "^7.3.1"`
    - `"@types/express": "^5.0.6"`
    - `"@types/express-session": "^1.19.0"`
    - `"@types/cors": "^2.8.19"`
    - `"@types/supertest": "^7.2.1"`
  - `grep`/`findstr` search across the entire repository confirms **zero** imports of `express`, `express-session`, `connect-mongo`, `helmet`, `cors`, or `supertest`.
  - The application is completely hosted on Next.js 16 App Router (`src/app/api/*`).
  - Session authentication is implemented with custom signed session cookies and direct Mongo queries in `server/src/auth/session.ts` and `server/src/db/repository.ts`.
  - Tests use Vitest with NextRequest/mock helpers rather than supertest.
- **Affected Files:**
  - `package.json`
  - `package-lock.json`
- **Proposed Change:**
  - Safely uninstall or remove these 10 unused packages.
  - Run `npm test` and `npm run build` to confirm zero breakages.
- **Risk:** **Low**. Eliminates ~100MB of unused node_modules and prevents dependency security vulnerabilities.
- **Tests Required:** `npm run build` and `npm test`.

---

## Category 5: Redundant State, CSS, or Abstractions

### CLN-05: Missing Flashcard Builder Controls in `KitWorkspace.tsx`
- **Category:** Incomplete Feature in Builder Abstraction
- **Evidence:**
  - `BuilderTab` in `src/app/components/KitWorkspace.tsx` implements inline editing, reordering, deletion, and addition for **Questions** and **Company Brief**, but omits flashcard management.
  - Section 6 of the assignment PDF requires:
    > *"Flashcards can also be edited, added, and deleted by hand in the builder."*
  - The state handler `onKitUpdate({ ...kit, flashcards: [...] })` is already in place, but UI inputs for flashcards are missing in `BuilderTab`.
- **Affected Files:**
  - `src/app/components/KitWorkspace.tsx`
- **Proposed Change:**
  - Add a "Flashcards" section inside `BuilderTab` with:
    - An accordion or card list showing all flashcards with front/back fields.
    - Inline editing for `front` and `back` text.
    - Delete button for removing a flashcard.
    - "Add Flashcard" modal or expandable row to create a custom card.
- **Risk:** **Low-Medium** (Must preserve existing styling, design system tokens, and avoid altering other workspace tabs).
- **Tests Required:** Manual UI verification and workspace test suite.

---

## Category 6: Temporary / Debug Files and Generated Artifacts

### CLN-06: `test-output.json`
- **Category:** Temporary / Generated Artifact
- **Evidence:**
  - Generated during verification of the evaluation command: `npm run evaluate -- --input cases.json --output test-output.json`.
  - Untracked in git.
- **Affected Files:**
  - `test-output.json`
- **Proposed Change:** Either delete `test-output.json` or add it to `.gitignore` so temporary grading runs do not clutter the working tree.
- **Risk:** **Zero**.
- **Tests Required:** None.

---

## Category 7: Code That Looks Redundant but Is STRICTLY REQUIRED

### CLN-07: Local Test SSRF Override (`ALLOW_PRIVATE_URLS = "true"`)
- **Category:** Required by Assessment
- **Evidence:**
  - In `server/src/cli/evaluate.ts` (lines 10–12):
    ```ts
    if (!process.env.ALLOW_PRIVATE_URLS) {
      process.env.ALLOW_PRIVATE_URLS = "true";
    }
    ```
  - Section 9 / Evaluation rules specify that automated test suites may run against local mock HTTP fixture servers (e.g. `http://127.0.0.1:8080/fixtures/company.html`).
  - The URL policy (`server/src/pipeline/research/url-policy.ts`) enforces strict SSRF protections in production (blocking private RFC 1918/Loopback IPs).
- **Verdict:** **KEEP AS-IS**. Removing this will cause automated offline fixture evaluation to fail.

### CLN-08: In-Memory Repository Fallback in `server/src/db/repository.ts`
- **Category:** Required for Clean-Clone Local Verification
- **Evidence:**
  - In `server/src/db/repository.ts`, if `MONGODB_URI` is unset or MongoDB is unreachable, the repository transparently falls back to an in-memory Map store.
  - Section 9 states:
    > *"Your code will be evaluated using an automated test harness... npm run evaluate -- --input cases.json --output kits.json"*
  - The evaluation command only runs the pipeline and outputs a JSON file; it must not fail if an external MongoDB daemon is not running.
- **Verdict:** **KEEP AS-IS**. In-memory fallback ensures zero-dependency execution for evaluation and unit testing, while production Atlas remains enforced via environment configuration.

### CLN-09: Coexistence of `POST /api/kit` and `POST /api/kits`
- **Category:** Required by Distinct Specification Sections
- **Evidence:**
  - Section 8 explicitly specifies: `POST /api/kit` accepting `{ jd, company_url, days }` returning the generated kit JSON directly.
  - Section 5 & 7 specify: `POST /api/kits` and `GET /api/kits` for user-authenticated persistence and kit dashboard listing.
- **Verdict:** **KEEP BOTH**. They serve distinct purposes: `/api/kit` is the public/headless evaluation endpoint, while `/api/kits` is the authenticated SaaS application endpoint.

### CLN-10: Section-Level Regeneration Endpoint (`/api/kits/[id]/regenerate`)
- **Category:** Required by Section 6 (Selective Regeneration)
- **Evidence:**
  - Section 6 states:
    > *"Users can regenerate individual sections (a category of questions, the study schedule, or the company brief) without re-running the entire pipeline. Any pinned or manually edited questions are preserved during regeneration."*
- **Verdict:** **KEEP AS-IS**. Strictly mandated by the specification.

---

## Action Plan & Recommended Priority

| Priority | Item | Description | Action |
|:---|:---|:---|:---|
| **P1** | `REQ-BLD-02 / CLN-05` | Add Flashcard inline editing/adding/deleting to `BuilderTab` in `KitWorkspace.tsx` | Functional requirement completion |
| **P2** | `CLN-04` | Remove unused Express, Helmet, CORS, Supertest dependencies from `package.json` | Cleanup & package footprint reduction |
| **P3** | `CLN-01` | Remove empty directories `server/src/api/`, `server/src/middleware/`, `server/src/services/` | Filesystem cleanliness |
| **P4** | `CLN-02 / CLN-03` | Deduplicate `RequestSchema` and error translation between `/api/kit` and `/api/kits` | Maintainability improvement |
| **P5** | `CLN-06` | Add `test-output.json` to `.gitignore` | Prevent git pollution |
