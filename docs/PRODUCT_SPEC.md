# DocuDrift — Product Spec

## Problem

READMEs and setup docs rot. A repo's `package.json`, `.env.example`, Dockerfiles, and
source code change; the README doesn't. New contributors and users hit broken install
steps, undocumented env vars, and stale commands with no way to know the doc is wrong
until they've already wasted time on it.

## Target user

Maintainers of JS/TS open-source or internal repos who want a quick, objective check
of "does my README still match my repo?" — and prospective contributors/evaluators
who want to sanity-check a repo before investing time in it.

## Value proposition

Paste a public GitHub repo URL, get back a report of concrete documentation/reality
mismatches, each backed by evidence (the exact lines in the exact files that
disagree) and a suggested fix. No AI guesswork, no false-positive prose critique —
only checks that are mechanically verifiable.

## MVP scope

**In scope**

- Public GitHub repositories only (no auth, no private repo access)
- JavaScript/TypeScript repositories only (identified by presence of `package.json`)
- Inputs read: `README.md`, `package.json`, env example files (`.env.example`,
  `.env.sample`, etc.), Docker files (`Dockerfile`, `docker-compose.yml`), lockfiles
  (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`), and a bounded set of source
  files selected by heuristics (see Architecture doc)
- Deterministic, rule-based detectors only — every finding must be reproducible from
  static comparison of two artifacts, never inferred by a model
- A single synchronous scan flow: submit URL → wait → view report
- Scan history is stored, so a previous report can be revisited

**Out of scope (for MVP)**

- Private repositories, any GitHub auth/OAuth flow
- Non-JS/TS ecosystems (Python, Go, Rust, etc.)
- Automatic PR creation / applying fixes back to GitHub
- AI/LLM-generated fixes or explanations — fix suggestions are templated strings
- Multi-branch or multi-commit historical drift tracking
- Real-time/webhook-triggered re-scans

## Core concepts

- **Scan** — one analysis run of one repo at one commit SHA.
- **Detector** — a single deterministic rule that compares two or more artifacts
  (e.g., README prose vs. `package.json` scripts) and emits zero or more findings.
- **Finding** — one detected instance of drift: a claim, the evidence that
  contradicts it, a severity, and a suggested fix.
- **Evidence** — the exact source (file path, line range, snippet) for both sides of
  the mismatch, so the user can verify the finding themselves without trusting a
  black box.

## User flow

1. User lands on the app, pastes a public GitHub repo URL (e.g.
   `https://github.com/owner/repo`) into a single input, submits.
2. App validates the URL, fetches the repo, confirms it's a JS/TS project.
3. App runs the detector suite and returns a report (single request, synchronous —
   see Architecture doc for why this is acceptable at MVP file-count scale).
4. Report view shows:
   - Repo header (name, default branch, commit SHA scanned, scan timestamp)
   - Summary counts by severity (error / warning / info)
   - A list of findings, each expandable to show: title, plain-English description,
     side-by-side evidence snippets with file/line references, and a suggested fix
   - Empty state: "No drift detected" when the suite finds nothing
5. User can revisit a past report via its scan URL (`/scans/:id`).

## Detector list (functional spec)

Each detector below states what it compares, why it matters, and an example.

| # | Detector | Compares | Why it matters | Example finding |
|---|----------|----------|-----------------|------------------|
| 1 | Missing/undocumented scripts | Commands referenced in README code blocks (`npm run X`, `yarn X`, `pnpm X`) vs. `package.json` `scripts` keys | A documented command that doesn't exist is an instant dead end for a new user | README says `npm run start:dev`; no such script in `package.json` |
| 2 | Package manager mismatch | Install command shown in README (`npm install` / `yarn` / `pnpm install`) vs. which lockfile(s) actually exist | Following the "wrong" package manager's instructions can produce a broken or inconsistent install | README says `npm install`; repo only has `pnpm-lock.yaml` |
| 3 | Multiple conflicting lockfiles | Presence of more than one of `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` | Ambiguous which manager is authoritative regardless of what docs say | Repo has both `package-lock.json` and `yarn.lock` |
| 4 | Env var drift | Vars in `.env.example` vs. vars documented in a README "Environment/Configuration" section vs. `process.env.X` usages in source | Undocumented required vars or stale documented-but-unused vars both cause setup failures | `.env.example` has `STRIPE_SECRET_KEY`; README config table omits it |
| 5 | Node engine mismatch | `engines.node` in `package.json` vs. a stated Node version in README (e.g. "Requires Node 18+") | Wrong stated version leads to confusing runtime errors on install | `package.json` requires Node `>=20`; README says "Node 16 or later" |
| 6 | Docker instructions drift | Ports/env vars in README's `docker run`/`docker-compose` examples vs. actual `Dockerfile` `EXPOSE` / `docker-compose.yml` ports & env | Wrong port docs mean "it's not working" support requests | README says app runs on `:3000`; Dockerfile exposes `8080` |
| 7 | Dead file/link references | Relative links and inline file-path references in README vs. actual repository tree | Broken pointers erode trust and block navigation | README links to `docs/CONTRIBUTING.md`, file doesn't exist |
| 8 | License mismatch | License named in README vs. `package.json` `license` field vs. presence/content of a `LICENSE` file | Legal-adjacent inconsistency, easy to detect, easy to fix | README says "MIT", `package.json` says `"license": "UNLICENSED"` |
| 9 | Version/badge drift | Version referenced in README prose or badges vs. `package.json` `"version"` | Stale version claims confuse users diagnosing issues | README badge shows `v1.2.0`, `package.json` is at `2.0.0` |
| 10 | Missing core sections | README lacks any recognizable Installation/Usage section at all | Not "drift" strictly, but a deterministic completeness gap worth surfacing at low severity | Repo has no "## Installation" or "## Usage" heading anywhere |

Detectors 1–7 are the MVP-critical set (they require cross-file drift, the app's core
premise). Detectors 8–10 are included if time permits but are lower priority.
Post-MVP candidates (not built now): dependency major-version claims in prose,
CI badge vs. actual CI config, multi-branch drift over time.

## Suggested fixes

Every finding includes a **templated, deterministic** suggested fix (e.g., "Add
`STRIPE_SECRET_KEY` to the Environment Variables section" or "Update the Node engine
requirement in README to `>=20`"). Fixes are text suggestions only — the MVP never
writes to the repo or opens a PR.

## Success criteria for the MVP

- A user can paste a real public JS/TS repo URL and get a report back in well under
  the time it'd take to read the README themselves.
- Every finding is independently verifiable by the user from the evidence shown —
  zero "trust me" findings.
- False positives are rare enough that the tool feels credible on a handful of
  well-known public repos used for manual testing.

## Non-goals / explicit anti-scope

- This is not a linter for prose quality, grammar, or writing style.
- This is not a general static-analysis or security-scanning tool.
- This is not trying to achieve 100% detector recall — a small, high-precision
  detector set beats a large, noisy one for MVP trust-building.
