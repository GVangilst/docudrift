# DocuDrift

DocuDrift finds **documentation drift** in public JavaScript/TypeScript GitHub
repositories. Paste a repo URL and get back a report of concrete mismatches
between the README and the actual code — each backed by file/line evidence and a
templated suggested fix. No AI guessing: every finding is a deterministic
comparison between two artifacts in the repo.

It's a single **Next.js** app (API routes + React UI), **stateless** (no
database), and it holds itself to high precision — on most repos it correctly
finds nothing.

## What it checks

Deterministic, cross-artifact detectors:

- **command-drift** — a README `npm run <x>` / `npm start` / `npm test` with no
  matching `package.json` script.
- **package-manager-drift** — the install command shown in the README vs. the
  lockfile that's actually committed (and flags multiple conflicting lockfiles).
- **node-engine-mismatch** — a README Node version vs. `engines.node` /
  `.nvmrc` / `.node-version`.
- **docker-drift** — README `docker build` / `docker compose up` / `docker run`
  vs. the actual Dockerfile/compose **existence** and container **ports**.
- **file-reference-drift** — dead links: README links, images, and HTML
  `src`/`href` pointing at repo paths that don't exist (with a closest-match
  suggestion).

Each finding carries the exact file + line evidence for both sides of the
mismatch, so you can verify it without trusting a black box.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, paste a public GitHub repo URL, and submit.

## Environment

Copy `.env.example` to `.env` if you want to set:

- `GITHUB_TOKEN` — optional GitHub personal access token. Raises the
  unauthenticated GitHub API rate limit from 60 to 5,000 requests/hour. The app
  runs without it.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm start` — production build / serve
- `npm test` — unit + detector + API tests (Vitest)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint

## Deploying

It's a standard Next.js app with **no database**, so it deploys anywhere Next.js
runs (e.g. Vercel). The only optional config is `GITHUB_TOKEN` for a higher rate
limit.

## Scope

Public JS/TS repos only (identified by a root `package.json`). No auth, no
private repos, no PR creation, no AI-generated fixes. Scans are synchronous and
not persisted — a `?repo=` deep-link re-runs a scan, which is how a report is
shared or revisited.

See [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.
