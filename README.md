# DocuDrift

DocuDrift detects documentation drift in public JavaScript/TypeScript GitHub
repositories. Paste a repo URL and get back a report of concrete mismatches
between the README and the actual code — env vars, scripts, Docker config,
Node engine requirements, dead links — each backed by file/line evidence and a
suggested fix. No AI guessing: every finding is a deterministic comparison
between two artifacts in the repo.

See [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md),
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and
[`docs/MVP_CHECKLIST.md`](docs/MVP_CHECKLIST.md) for the full product and
technical plan.

## Tech stack (planned)

- Next.js (App Router) + TypeScript, Tailwind CSS
- Prisma + PostgreSQL
- Vitest for unit/integration tests
- Unauthenticated GitHub REST API for fetching public repo contents

## MVP goal

Given a public GitHub repo URL, synchronously fetch the README plus a bounded
set of key files (`package.json`, env examples, Docker files, lockfiles,
capped source files), run a deterministic detector suite against them, and
return a report of drift findings with evidence and suggested fixes — no auth,
no private repos, no PR creation, no AI-generated fixes.
