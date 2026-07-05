# DocuDrift — MVP Checklist

Reference: [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), [ARCHITECTURE.md](./ARCHITECTURE.md).
Order matters — each phase should be working and tested before the next starts.

Legend: `[x]` done · `[~]` partial (see note) · `[ ]` not started.

> **Stack note:** built as a single **Next.js (App Router) + TypeScript** app,
> not the split Express API / Vite SPA originally planned. API routes live at
> `src/app/api/**/route.ts`; the analyzer core lives under `src/lib/analyzer`
> and uses `RepoSnapshot`/`TruthModel`/`DocClaim`/`DriftIssue`. ARCHITECTURE.md
> has been reconciled to match (each section tagged Implemented/Partial/Planned).

## Phase 0 — Project setup

- [x] Init git repo, base `.gitignore` (node_modules, `.env`, build, logs, db files)
- [x] App layout: single Next.js app (App Router, `src/`, Tailwind, ESLint) —
      replaces the earlier `apps/api` + `apps/web` split
- [x] TS config + API health route: `GET /api/health` (`src/app/api/health/route.ts`)
- [~] Prisma installed; placeholder schema (generator + postgres datasource only).
      `Repo`/`Scan`/`Finding` models NOT yet defined or migrated; no local Postgres
      connection wired up
- [x] Landing page stub (`src/app/page.tsx`)
- [x] Vitest configured (`vitest.config.ts`, `npm test`) + `typecheck`/`lint` scripts
      (RTL/jsdom installed but not yet exercised — analyzer tests run in node env)
- [ ] CI runs typecheck + lint + tests (local npm scripts exist; no CI workflow yet)

## Phase 1 — GitHub fetch layer

- [ ] Parse/validate `repoUrl` → `{owner, repo}`, reject malformed input
      (`INVALID_URL`)
- [ ] Fetch repo metadata + default branch + commit SHA
- [ ] Fetch recursive file tree; detect and flag truncation
- [ ] Reject non-JS/TS repos (no root `package.json`) with `NOT_JS_TS`
- [ ] File selection logic: README, package.json, env example(s), Docker files,
      lockfile presence, capped source file list
- [ ] Fetch file contents with per-file size cap and total cap
- [ ] Handle `404` (`REPO_NOT_FOUND`), `403` rate limit (`RATE_LIMITED` with
      reset time), request timeout, optional `GITHUB_TOKEN` env var support
- [ ] Tests: mocked HTTP (nock/MSW) covering happy path + every error path above,
      no real network calls

## Phase 2 — Parsers / normalizers

> Implemented as `buildTruthModel()` (reality) + `extractDocClaims()` (doc claims)
> over a `RepoSnapshot`, rather than a single `NormalizedRepo`.

- [~] README claim extraction (`extractDocClaims`): `npm run/start/test` commands
      and file-path references. Full heading/code-block/link/env-var normalization
      not yet done
- [~] `package.json` parsing (in `buildTruthModel`): scripts, engines, version,
      license. deps/devDeps not yet captured
- [x] Env example parser: variable names from `.env.example`-style files
      (`envVars.ts`)
- [x] Docker file presence detector: Dockerfile(.dev/.prod), docker-compose.*,
      compose.* (`docker.ts` → `TruthModel.docker`)
- [x] Dockerfile parser: `EXPOSE` ports (`docker.ts` → `docker.exposedPorts`)
- [x] docker-compose parser: ports + host-required env keys (`docker.ts` →
      `docker.composePorts`, `docker.requiredEnvKeys`; full YAML/services parse
      not needed for current drift checks)
- [x] Lockfile presence detector (npm/yarn/pnpm/bun) — `buildTruthModel`
      (`lockfiles`, inferred `packageManager`)
- [x] Source scanner: `process.env.X` / `import.meta.env.X` usages (`envVars.ts`;
      file-count cap still to add)
- [x] Node version evidence parser: engines.node, volta.node, .nvmrc,
      .node-version, .tool-versions (`nodeVersions.ts`)
- [~] Truth model assembled (`TruthModel`: packageJson, rootFiles, filePaths,
      hasRootServerJs, envVarsFromExamples, envVarsFromCode, lockfiles,
      packageManager, nodeVersionRequirements, docker{files,exposedPorts,
      composePorts,requiredEnvKeys}) — grows as more parsers land
- [~] Tests: analyzer covered via fixture repos under `tests/fixtures/repos`;
      dedicated malformed/edge-case parser tests still to add

## Phase 3 — Detector engine

> Detectors currently run via `analyzeRepository()`; a formal registry with
> per-detector error isolation and severity ordering is not built yet.

- [~] Detector engine: `analyzeRepository()` runs detectors → `DriftIssue[]`.
      Registry / error isolation / severity ordering still to add
- [x] MVP-critical detectors — 7 of 7 done:
  - [x] `commandDriftDetector` (covers `missing-scripts`)
  - [x] `fileReferenceDriftDetector` (covers `dead-links`, w/ fuzzy path suggestion)
  - [x] `envVarDriftDetector` (covers `env-var-drift`; README vs `.env.example`
        vs `process.env`/`import.meta.env`, with value redaction)
  - [x] `packageManagerDriftDetector` (covers `package-manager-mismatch` +
        `multiple-lockfiles` ambiguity; ignores README "alternatives" lines)
  - [x] `nodeEngineMismatchDetector` (covers `node-engine-mismatch`; README/nvm
        vs engines.node/.nvmrc/.node-version/.tool-versions/volta, semver-based)
  - [x] `dockerDriftDetector` (covers `docker-drift`; docker build/-f/compose vs
        Dockerfile(.dev/.prod)/compose files; ignores URLs & prereq mentions.
        Also port drift: `docker run -p` container port vs `EXPOSE`/compose
        ports; and compose host-required env vars undocumented in README/.env)
- [ ] Implement stretch detectors if time allows: `license-mismatch`,
      `version-badge-drift`, `missing-core-sections`
- [~] Each detector ships fixture-based unit tests (done for all 7:
      `tests/analyzer/*.test.ts`, should-fire + should-not-fire cases)
- [x] Suggested-fix templates written for every built detector (plain strings, no AI)

## Phase 4 — API

- [ ] `POST /api/scans` — orchestrates fetch → parse → detect → persist →
      respond, wired to real detector engine
- [ ] `GET /api/scans/:id` — returns stored report
- [ ] `GET /api/scans` — paginated recent-scans list
- [ ] Consistent error response shape across all routes
- [ ] Wall-clock scan timeout enforced end-to-end
- [ ] Tests: Supertest integration tests for all three routes (GitHub layer
      mocked), including every error code path

## Phase 5 — Frontend

- [ ] Landing page: single URL input, submit, loading state, error display
- [ ] Report view: repo header, severity summary counts, findings list
- [ ] Finding detail: expandable evidence (side-by-side file/line snippets),
      suggested fix text
- [ ] Empty state: "No drift detected"
- [ ] `/scans/:id` route loads a stored report by ID (shareable link)
- [ ] Recent scans list/history view
- [ ] Markdown/snippet rendering sanitized (no raw HTML passthrough)
- [ ] Tests: RTL tests for report rendering from fixture JSON, input validation,
      error states

## Phase 6 — Hardening & polish

- [ ] SSRF guard double-checked: no client-supplied URL ever reaches `fetch`
      directly, only derived `api.github.com` calls
- [ ] Per-file and total size/count caps verified against a large real repo
- [ ] Rate-limit UX: clear message + reset time shown to user on `RATE_LIMITED`
- [ ] Manual smoke test against 3–5 real public JS/TS repos of varying sizes
      (small clean repo, repo with known drift, large repo near size caps)
- [ ] README for the DocuDrift project itself (setup, running locally, env vars)

## Explicitly deferred (post-MVP)

- Private repo support / GitHub OAuth
- Async job queue + polling for large repos
- AI-generated fixes / PR creation
- Non-JS/TS ecosystem support
- Historical drift tracking across commits/branches
