# DocuDrift — Architecture

## Stack

- **Backend**: Node.js 20+, TypeScript, Express
- **ORM/DB**: Prisma + PostgreSQL
- **Frontend**: React 18 + Vite (SPA), calls the backend over HTTP/JSON
- **GitHub access**: unauthenticated GitHub REST API (public repos only)
- **Validation**: Zod (request bodies, parsed-file schemas)
- **Testing**: Vitest (unit/detector), Supertest (API), React Testing Library
  (frontend), `nock`/MSW (mocked GitHub HTTP in tests)

Scans run **synchronously**: one HTTP request in, one full report out. This is
acceptable at MVP scale because the file set per repo is small and bounded (see
"File selection" below) and unauthenticated GitHub API calls are the dominant
latency cost, not local compute. No job queue, no worker process, no polling.

## High-level flow

```
┌─────────────┐      POST /api/scans { repoUrl }      ┌──────────────────┐
│  React SPA  │ ─────────────────────────────────────▶ │   Express API    │
│             │ ◀───────────────────────────────────── │                  │
└─────────────┘         Report JSON (200)               └────────┬─────────┘
                                                                  │
                                                                  ▼
                                                   ┌──────────────────────────┐
                                                   │  GitHub Fetch Layer      │
                                                   │  (REST API, unauth)      │
                                                   └────────────┬─────────────┘
                                                                │ repo tree + file contents
                                                                ▼
                                                   ┌──────────────────────────┐
                                                   │  Parsers / Normalizers   │
                                                   │  (README, package.json, │
                                                   │  env, docker, lockfiles) │
                                                   └────────────┬─────────────┘
                                                                │ normalized data model
                                                                ▼
                                                   ┌──────────────────────────┐
                                                   │   Detector Engine        │
                                                   │  (runs each detector,    │
                                                   │   collects Findings)     │
                                                   └────────────┬─────────────┘
                                                                │ Scan + Findings
                                                                ▼
                                                   ┌──────────────────────────┐
                                                   │       PostgreSQL         │
                                                   └──────────────────────────┘
```

## Data pipeline (step by step)

1. **Input validation** — `POST /api/scans` receives `{ repoUrl }`. Validate it
   matches `https://github.com/<owner>/<repo>` (optionally with `.git` suffix or
   trailing slash). Reject anything else (SSRF guard: we only ever construct
   `api.github.com` URLs server-side from the parsed `owner/repo`, never fetch a
   user-supplied URL directly).
2. **Repo metadata** — `GET /repos/{owner}/{repo}` to confirm the repo exists, is
   public, get the default branch and current commit SHA (`GET
   /repos/{owner}/{repo}/branches/{default_branch}`).
3. **Tree fetch** — `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` to get
   the full file tree in one call (subject to GitHub's tree size cap; repos whose
   tree is truncated are still scanned but flagged in the report as
   "partial scan").
4. **JS/TS confirmation** — if no `package.json` exists at repo root, the scan is
   rejected with a clear error ("DocuDrift currently supports JavaScript/TypeScript
   repositories only").
5. **File selection** — from the tree, select a bounded set of "key files":
   - `README.md` (root; case-insensitive match, first match wins)
   - `package.json` (root)
   - env example files: any root-level file matching
     `.env.example|.env.sample|.env.template` (case-insensitive)
   - Docker files: `Dockerfile`, `docker-compose.yml`/`docker-compose.yaml` (root)
   - lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` (root — presence
     is what matters, most detectors don't need to parse full contents)
   - a capped set of source files (`src/**/*.{js,ts,jsx,tsx}`, hard cap e.g. 200
     files / 2 MB total) — only fetched contents for source files are scanned for
     `process.env.X` usages, and only if the env-var-drift detector needs them
6. **Content fetch** — for each selected file, `GET
   /repos/{owner}/{repo}/contents/{path}` (or raw.githubusercontent.com via the
   blob SHA from the tree) — base64-decoded, size-capped per file (e.g. 1 MB) to
   avoid pathological repos blowing up memory.
7. **Parse/normalize** — each file type has a dedicated parser producing a typed,
   normalized shape (see "Normalized data model" below). Parsing is defensive:
   a file that fails to parse produces no data for that source, never throws the
   whole scan.
8. **Detect** — the Detector Engine runs each registered detector against the
   normalized data model. Each detector is a pure function:
   `(NormalizedRepo) => Finding[]`. A detector that throws is caught and skipped
   (logged), it never fails the whole scan.
9. **Persist** — write `Repo` (upsert), `Scan`, `Finding[]` rows in one transaction.
10. **Respond** — return the full report as JSON; the same shape is what `GET
    /api/scans/:id` returns later.

## Normalized data model (in-memory, pre-detector)

```ts
type NormalizedRepo = {
  repo: { owner: string; name: string; defaultBranch: string; commitSha: string };
  readme: {
    raw: string;
    headings: { text: string; line: number }[];
    codeBlocks: { lang: string | null; content: string; startLine: number }[];
    links: { text: string; href: string; line: number }[];
    envVarsDocumented: { name: string; line: number }[]; // parsed from a config-ish section/table
  } | null;
  packageJson: {
    raw: object;
    scripts: Record<string, string>;
    engines: Record<string, string>;
    version: string | null;
    license: string | null;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  } | null;
  envExample: { path: string; vars: string[] } | null;
  docker: {
    dockerfile: { raw: string; exposedPorts: number[] } | null;
    compose: { raw: string; services: { name: string; ports: string[]; envKeys: string[] }[] } | null;
  };
  lockfiles: { present: ('npm' | 'yarn' | 'pnpm')[] };
  sourceEnvUsages: { name: string; file: string; line: number }[];
  fileTree: { path: string; type: 'blob' | 'tree' }[]; // for dead-link checks
  truncated: boolean; // tree was too large / capped
};
```

## Detector engine

- Detectors are registered in a single array with a stable `id`, `title`, and
  `severity` default. Each implements:
  `run(repo: NormalizedRepo): Omit<Finding, 'id' | 'scanId'>[]`.
- Engine runs all detectors, flattens results, assigns IDs, and returns them
  ordered by severity (error → warning → info) then detector order.
- Detector list (maps to Product Spec table): `missing-scripts`,
  `package-manager-mismatch`, `multiple-lockfiles`, `env-var-drift`,
  `node-engine-mismatch`, `docker-drift`, `dead-links`, `license-mismatch`,
  `version-badge-drift`, `missing-core-sections`.
- Each `Finding` shape:

```ts
type Finding = {
  id: string;
  scanId: string;
  detectorId: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  evidence: {
    label: string; // e.g. "README", "package.json"
    file: string;
    startLine: number;
    endLine: number;
    snippet: string;
  }[];
  suggestedFix: string;
};
```

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/scans` | Body `{ repoUrl }`. Runs the full pipeline synchronously, persists, returns the created `Scan` + `Finding[]` (report). |
| `GET` | `/api/scans/:id` | Returns a previously stored report by scan ID. |
| `GET` | `/api/scans` | Lists recent scans (paginated: id, repo, createdAt, summary counts) — for a lightweight history view. |
| `GET` | `/api/health` | Liveness check. |

Error responses use a consistent shape `{ error: { code, message } }` with codes
like `INVALID_URL`, `REPO_NOT_FOUND`, `REPO_PRIVATE`, `NOT_JS_TS`, `RATE_LIMITED`,
`REPO_TOO_LARGE`, `GITHUB_UPSTREAM_ERROR`.

## Database models (Prisma / Postgres)

```prisma
model Repo {
  id             String   @id @default(cuid())
  owner          String
  name           String
  url            String
  defaultBranch  String
  lastScannedAt  DateTime?
  scans          Scan[]

  @@unique([owner, name])
}

model Scan {
  id            String    @id @default(cuid())
  repoId        String
  repo          Repo      @relation(fields: [repoId], references: [id])
  commitSha     String
  status        ScanStatus @default(COMPLETED) // COMPLETED | FAILED (sync model — no PENDING at MVP)
  errorCode     String?
  errorMessage  String?
  truncated     Boolean   @default(false)
  createdAt     DateTime  @default(now())
  completedAt   DateTime?
  findings      Finding[]
}

enum ScanStatus {
  COMPLETED
  FAILED
}

model Finding {
  id            String   @id @default(cuid())
  scanId        String
  scan          Scan     @relation(fields: [scanId], references: [id])
  detectorId    String
  severity      Severity
  title         String
  description   String
  evidence      Json     // Finding['evidence'] shape, stored as JSON
  suggestedFix  String
}

enum Severity {
  ERROR
  WARNING
  INFO
}
```

No `FetchedFile` table at MVP — raw fetched file contents are not persisted (only
derived findings are), keeping storage small and side-stepping any question of
caching/staleness of third-party content. This can be added later if caching
across scans becomes a performance need.

## GitHub API constraints & handling

- Unauthenticated REST API is capped at 60 requests/hour per IP. A single scan
  uses ~3–8 requests (repo metadata, branch, tree, N file contents). This is
  workable for demo/low-volume use but will need a `GITHUB_TOKEN` env var
  (optional, server-side only, never exposed to the client) as a fast follow if
  usage grows — the fetch layer should read an optional token from the start so
  this is a config change, not a code change.
- On `403` rate-limit responses, surface `RATE_LIMITED` with the reset time from
  the `X-RateLimit-Reset` header.
- Per-file size cap and total-file-count cap (see File selection) protect against
  pathological repos; exceeding the tree size cap sets `truncated: true` on the
  scan rather than failing it.
- All outbound GitHub calls have a request timeout (e.g. 10s) and the overall
  scan has a wall-clock budget (e.g. 30s) after which it fails with a clear
  `GITHUB_UPSTREAM_ERROR`.

## Security considerations

- **SSRF**: the server never fetches a client-supplied URL directly. The client
  URL is parsed into `{owner, repo}` and only ever used to build
  `api.github.com/...` URLs. Reject anything that doesn't match the expected
  GitHub URL shape before any network call is made.
- **XSS**: README content and code snippets are rendered as text/markdown on the
  frontend through a sanitizing markdown renderer (no raw HTML passthrough).
- **Resource limits**: per-file size cap, total file count/size cap, request and
  scan timeouts (above) prevent memory/time exhaustion from a single request.
- **No secrets stored**: env var *names* are compared/displayed, never values.

## Frontend structure

- `POST /api/scans` triggered from a single-input landing page; while awaiting
  the response the UI shows a loading state (this can take a few seconds — set
  expectations with a progress indicator, not a spinner-only wait).
- Report view renders summary counts + a findings list; each finding expands to
  show evidence panes side by side with file/line labels and the suggested fix.
- `/scans/:id` route re-fetches via `GET /api/scans/:id` for shareable/bookmarkable
  report links; `/scans` (or a "recent scans" panel) lists history via
  `GET /api/scans`.

## Test strategy

- **Detector unit tests** (Vitest): each detector gets fixture-based tests —
  construct a minimal `NormalizedRepo` fixture that should/shouldn't trigger it,
  assert exact `Finding[]` output. This is the highest-value test layer since
  detectors are pure functions.
- **Parser unit tests**: each normalizer (README, package.json, env, Docker,
  lockfile presence) tested against realistic sample file contents, including
  malformed/edge-case input (no crashes, graceful partial results).
- **GitHub fetch layer tests**: HTTP mocked with `nock`/MSW — cover happy path,
  404 (repo not found), 403 (rate limited), truncated tree, non-JS/TS repo
  rejection — no real network calls in the test suite.
- **API integration tests** (Supertest): hit `/api/scans`, `/api/scans/:id`,
  `/api/scans` against a test Postgres (or SQLite/in-memory equivalent via
  Prisma test setup), with the GitHub layer mocked underneath.
- **Frontend component tests** (React Testing Library): report rendering from a
  fixed report JSON fixture (summary counts, finding expand/collapse, evidence
  display), form validation on the URL input, error states.
- **Manual smoke test**: run a scan against a small number of real, well-known
  public JS/TS repos as a manual sanity check before considering the MVP done —
  not part of CI (avoids burning rate limits / flaky external dependency in
  automated tests).
