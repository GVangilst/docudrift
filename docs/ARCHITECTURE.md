# DocuDrift — Architecture

> **Status:** built and working end-to-end — the GitHub fetch layer, the
> `POST /api/scans` route, the analyzer + detector suite, and the React report UI
> all run today. The tool is **stateless**: scans are not persisted (see
> [MVP_CHECKLIST.md](./MVP_CHECKLIST.md)).

## Stack

**Status: Implemented (app shell) / Planned (some libraries)**

- **App**: Next.js (App Router) + TypeScript — a single app, not a split
  Express API + Vite SPA. API routes live at `src/app/api/**/route.ts`; the
  analyzer core lives under `src/lib/analyzer`.
- **UI**: React 19 + Tailwind CSS.
- **Persistence**: none — the tool is stateless (no DB, no ORM).
- **GitHub access**: unauthenticated GitHub REST API, public repos only; an
  optional server-side `GITHUB_TOKEN` raises the rate limit.
- **Testing**: Vitest, with on-disk fixture repos under `tests/fixtures/repos`
  and an injected/mocked `fetch` for GitHub HTTP (tests never hit real GitHub).

Scans run **synchronously**: one HTTP request in, one full report out — no job
queue, no worker, no polling. This is fine at this scale because the file set per
repo is small and bounded and GitHub API latency dominates local compute.

## High-level flow

**Status: Implemented end-to-end**

`POST /api/scans` builds a `RepoSnapshot` from the GitHub fetch layer and runs it
through the same analyzer used by the fixture tests. Nothing is persisted; the
report is returned in the response.

```
┌─────────────┐     POST /api/scans { repoUrl }      ┌────────────────────────┐
│  Next.js UI │ ───────────────────────────────────▶ │  Route handler         │  [planned]
│  (report)   │ ◀─────────────────────────────────── │  src/app/api/scans     │
└─────────────┘        Report JSON (200)              └───────────┬────────────┘
                                                                   │
                            ┌──────────────────────────┐          │  RepoSnapshot
                            │  GitHub Fetch Layer       │  [planned]
                            │  (REST API, unauth)       │──────────┘
                            └──────────────────────────┘
                                                                   ▼
                                          ┌──────────────────────────────────────┐
                                          │  Analyzer core  (src/lib/analyzer)    │  [implemented]
                                          │                                        │
                                          │  buildTruthModel(snapshot) → TruthModel│
                                          │  extractDocClaims(snapshot) → DocClaim[]│
                                          │  detectors(claims, truth) → DriftIssue[]│
                                          └───────────────────┬────────────────────┘
                                                              │ DriftIssue[]
                        ┌─────────────────────────────────────┴──────────────┐
                        ▼                                                     ▼
             (return in HTTP response)                          ┌──────────────────────┐
                                                                │   PostgreSQL          │ [planned]
                                                                └──────────────────────┘
```

Today the analyzer is exercised directly in tests via `loadFixtureRepo(name)`
(`tests/helpers/loadFixtureRepo.ts`), which walks a fixture directory into a
`RepoSnapshot`.

## Data pipeline (step by step)

**Status: steps 6–8 Implemented; steps 1–5, 9–10 Planned**

Planned production pipeline. Steps marked *(implemented)* exist today; the rest
are the target design for the GitHub-backed path.

1. **Input validation** *(planned)* — `POST /api/scans` receives `{ repoUrl }`.
   Validate it matches `https://github.com/<owner>/<repo>` (optionally with
   `.git` suffix or trailing slash). Reject anything else (SSRF guard: only ever
   construct `api.github.com` URLs server-side from the parsed `owner/repo`,
   never fetch a user-supplied URL directly).
2. **Repo metadata** *(planned)* — `GET /repos/{owner}/{repo}` to confirm the
   repo exists and is public; get default branch and commit SHA.
3. **Tree fetch** *(planned)* — `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`;
   flag truncation for oversized trees.
4. **JS/TS confirmation** *(planned)* — reject repos with no root `package.json`.
5. **File selection** *(planned)* — select a bounded "key files" set: `README.md`,
   `package.json`, env examples, Docker files, lockfiles, and a capped source
   file set (`src/**/*.{js,ts,jsx,tsx}`, hard caps on count/size).
6. **Snapshot assembly** *(implemented)* — the selected files become a
   `RepoSnapshot` (`{ repo: {owner, name}, files: {path, content}[] }`). In
   tests this comes from a fixture directory instead of GitHub.
7. **Parse** *(implemented)* — `buildTruthModel(snapshot)` derives reality facts
   and `extractDocClaims(snapshot)` derives documentation claims. Parsing is
   defensive: a malformed `package.json` yields `packageJson: null` rather than
   throwing.
8. **Detect** *(implemented)* — `analyzeRepository(snapshot)` runs each detector
   with per-detector error isolation and returns `DriftIssue[]`.
9. **Respond** *(implemented)* — `buildReport()` orders findings by severity and
   the route returns the report JSON. Nothing is persisted.

## Analyzer data model (in-memory)

**Status: Implemented**

The doc originally specified a single `NormalizedRepo`. The implementation
instead separates three concerns: the raw snapshot, derived "reality"
(`TruthModel`), and derived documentation claims (`DocClaim`). Detectors compare
claims against the truth model. Current shapes (`src/lib/analyzer/types.ts`):

```ts
type RepoFile = { path: string; content: string };

type RepoSnapshot = {
  repo: { owner: string; name: string };
  files: RepoFile[];
};

// "Reality" derived from non-doc sources.
type TruthModel = {
  packageJson: {
    scripts: Record<string, string>;
    engines: Record<string, string>;
    version: string | null;
    license: string | null;
  } | null;
  hasRootServerJs: boolean;   // npm start falls back to a root server.js
  rootFiles: string[];        // root-level paths
  filePaths: string[];        // every repo path (used for dead-link checks)
};

// One claim the README makes; a discriminated union on `kind`.
type DocClaimSource = { file: string; line: number; snippet: string };

type NpmScriptClaim = {
  kind: 'npm-script';
  command: string;      // "npm run build"
  scriptName: string;   // "build"
  source: DocClaimSource;
};

type FileReferenceClaim = {
  kind: 'file-reference';
  rawText: string;      // path as written, e.g. "./src/App.jsx"
  path: string;         // normalized repo-relative path
  source: DocClaimSource;
};

type DocClaim = NpmScriptClaim | FileReferenceClaim;
```

**Not yet modeled** (planned as more parsers/detectors land): structured README
(headings, code blocks, links, documented env vars), `package.json`
dependencies/devDependencies, env-example vars, Docker ports/env, lockfile
presence, `process.env.X` source usages, `defaultBranch`/`commitSha`, and a
`truncated` flag. These extend `TruthModel`/`DocClaim` as needed.

## Detector engine

**Status: Implemented — 5 detectors, registry + per-detector error isolation**

- Detectors are plain functions `(claims: DocClaim[], truth: TruthModel) =>
  DriftIssue[]`, run from a registered list in `analyzeRepository()` with
  catch-and-skip isolation (one throwing detector can't fail the scan); severity
  ordering happens in `buildReport()`.
- **All detectors are structural** — they compare README claims against
  structured artifacts, never against arbitrary scanned source (see PRODUCT_SPEC
  "Confidence tiers & limitations"):
  - `command-drift` — README `npm run/start/test` vs `package.json` scripts.
  - `package-manager-drift` — README install command vs the lockfile present.
  - `node-engine-mismatch` — README Node version vs `engines.node`/`.nvmrc`.
  - `file-reference-drift` (dead-links) — README path references vs the file tree,
    with a fuzzy closest-path suggestion.
  - `docker-drift` — README `docker build`/`compose`/`run` vs Dockerfile/compose
    **file existence** (documents `docker-compose up`/`docker build` but no such
    file exists anywhere in the tree) and **container port drift** (README `-p`
    vs `EXPOSE`/compose `ports`). Purely structural.
- **Removed:** `env-var-drift` and the `docker-drift` **compose-env check**
  ("compose requires a host env var missing from `.env.example`"). Both rest on
  the same unrecoverable questions — *which files/compose are "the app"* (a
  directory denylist over an open vocabulary: `.do/`, `metrics/otel/`,
  `examples/`, …) and *is this var "documented"* — so they produced open-ended
  false positives. Consequently the analyzer **no longer fetches arbitrary source
  or `.env.example` files** — `selectKeyFiles` fetches only README,
  `package.json`, lockfiles, node-version files, and Docker/compose files.

The finding shape is `DriftIssue` (the doc previously called this `Finding`):

```ts
type DriftSeverity = 'error' | 'warning' | 'info';

type DriftEvidence = {
  label: string;   // e.g. "README", "package.json"
  file: string;
  line: number;
  snippet: string;
};

type DriftIssue = {
  id: string;          // e.g. "command-drift:build:14"
  detectorId: string;
  severity: DriftSeverity;
  title: string;
  description: string;
  evidence: DriftEvidence[];
  suggestedFix: string;
};
```

Note: the product spec's "medium" severity maps to `warning` in this model
(`error`/`warning`/`info`).

## API routes

**Status: Implemented**

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness check, returns `{ status: "ok" }`. |
| `POST` | `/api/scans` | Body `{ repoUrl }`. Runs the pipeline synchronously and returns the report (nothing is stored). |

Error responses use a consistent shape `{ error: { code, message } }` with codes
like `INVALID_URL`, `REPO_NOT_FOUND`, `REPO_PRIVATE`, `NOT_JS_TS`, `RATE_LIMITED`,
`REPO_TOO_LARGE`, `TIMEOUT`, `GITHUB_UPSTREAM_ERROR`.

## Persistence

**None — the tool is stateless.** Reports are computed on each request and
returned in the response; there is no database. Sharing/revisiting a report is
done with a `?repo=` deep-link that prefills the input and auto-runs the scan.

## GitHub API constraints & handling

**Status: Implemented**

- Unauthenticated REST API is capped at 60 requests/hour per IP. A single scan
  will use ~3–8 requests. An optional server-side `GITHUB_TOKEN` env var (never
  exposed to the client) is planned to raise limits — the fetch layer should
  read it from the start so raising limits is a config change, not a code change.
- On `403` rate-limit responses, surface `RATE_LIMITED` with the reset time from
  the `X-RateLimit-Reset` header.
- Per-file size cap and total-file-count cap protect against pathological repos;
  exceeding the tree size cap sets a `truncated` flag rather than failing.
- Outbound GitHub calls get a request timeout (~10s) and the overall scan a
  wall-clock budget (~30s), after which it fails with `GITHUB_UPSTREAM_ERROR`.

## Security considerations

**Status: Planned — applies once the fetch layer and report UI exist**

- **SSRF**: the server never fetches a client-supplied URL directly. The client
  URL is parsed into `{owner, repo}` and only used to build `api.github.com/...`
  URLs; anything not matching the expected GitHub URL shape is rejected before
  any network call.
- **XSS**: README content and code snippets render through a sanitizing markdown
  renderer (no raw HTML passthrough).
- **Resource limits**: per-file and total size/count caps plus request/scan
  timeouts prevent memory/time exhaustion from a single request.
- **No secrets stored**: env var *names* are compared/displayed, never values.

## Frontend structure

**Status: Implemented**

- `src/app/page.tsx` renders `ScanApp` (`src/components/ScanApp.tsx`), a client
  state machine (`idle | loading | success | error`).
- Submit calls `POST /api/scans` and renders `ReportView` — a severity
  `SummaryBar` plus a list of `FindingCard`s (title, description, evidence
  file/line snippets, suggested fix), with an empty "no drift" state and typed
  error rendering.
- A `?repo=` query param prefills the input and auto-runs the scan on load, which
  is how a scan is shared or revisited (there is no stored-report route).

## Test strategy

**Status: detector tests Implemented; other layers Planned**

- **Detector/analyzer tests** (Vitest) — *implemented.* Each detector has
  fixture-based tests (`tests/analyzer/*.test.ts`) that load a fake repo from
  `tests/fixtures/repos/<name>` via `loadFixtureRepo()` and assert the resulting
  `DriftIssue[]` (both should-fire and should-not-fire cases). Fixture repos are
  real directories on disk, excluded from ESLint.
- **Parser edge-case tests** — *planned.* Dedicated malformed/empty-input tests
  for each parser as they grow (never throw, graceful partial results).
- **GitHub fetch layer tests** — *planned.* HTTP mocked with `nock`/MSW covering
  happy path, 404, 403 rate-limit, truncated tree, non-JS/TS rejection; no real
  network in the suite.
- **API integration tests** (Supertest) — *planned.* Exercise the scan routes
  against a test database with the GitHub layer mocked underneath.
- **Frontend component tests** (React Testing Library) — *planned.* Report
  rendering from a fixed report fixture, input validation, error states.
- **Manual smoke test** — *planned.* Run against a few real public JS/TS repos
  before calling the MVP done; not part of CI (avoids burning rate limits and
  flaky external dependencies).
