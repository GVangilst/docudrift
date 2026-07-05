# DocuDrift — MVP Checklist

Reference: [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), [ARCHITECTURE.md](./ARCHITECTURE.md).
Order matters — each phase should be working and tested before the next starts.

## Phase 0 — Project setup

- [ ] Init git repo, base `.gitignore` (node_modules, `.env`, dist/build)
- [ ] Monorepo layout: `apps/api` (Express + TS), `apps/web` (React + Vite), or
      simple `server/` + `client/` split — pick one, document in root README
- [ ] `apps/api`: TS config, Express app skeleton, `GET /api/health`
- [ ] Prisma installed, connected to local Postgres, `Repo`/`Scan`/`Finding`/enums
      migrated per ARCHITECTURE.md schema
- [ ] `apps/web`: Vite + React + TS skeleton, single landing page stub
- [ ] Vitest configured in `apps/api`; RTL + Vitest (or Jest) configured in
      `apps/web`
- [ ] CI (or local script) runs typecheck + lint + tests on both apps

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

- [ ] README parser: headings, fenced code blocks (with language), links,
      best-effort "documented env vars" extraction from a config/env section
- [ ] `package.json` parser: scripts, engines, version, license, deps/devDeps
- [ ] Env example parser: variable names from `.env.example`-style files
- [ ] Dockerfile parser: `EXPOSE` ports
- [ ] docker-compose parser: services, ports, env keys
- [ ] Lockfile presence detector (npm/yarn/pnpm)
- [ ] Source scanner: `process.env.X` usages (capped file set)
- [ ] Assemble `NormalizedRepo` from all of the above
- [ ] Tests: each parser against realistic fixture files + malformed/edge-case
      input (empty file, no matches, weird formatting) — never throws

## Phase 3 — Detector engine

- [ ] Detector registry + engine (`run(repo) => Finding[]`, per-detector error
      isolation, ordering by severity)
- [ ] Implement MVP-critical detectors: `missing-scripts`,
      `package-manager-mismatch`, `multiple-lockfiles`, `env-var-drift`,
      `node-engine-mismatch`, `docker-drift`, `dead-links`
- [ ] Implement stretch detectors if time allows: `license-mismatch`,
      `version-badge-drift`, `missing-core-sections`
- [ ] Each detector ships with its own fixture-based unit tests (should-fire and
      should-not-fire cases) per ARCHITECTURE.md test strategy
- [ ] Suggested-fix templates written for every detector (plain string, no AI)

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
