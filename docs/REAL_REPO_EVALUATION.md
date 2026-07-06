# Real-Repo Evaluation

Static evaluation of the DocuDrift pipeline (GitHub fetch → `analyzeRepository`)
against 11 public repos. **No repo code was executed; no dependencies installed;
no npm/pnpm/yarn/bun/Docker run.** Findings are deterministic detector output;
true/false-positive calls below are manual judgment cross-checked against the
actual repo files (no LLM used to decide drift).

- Harness: [`scripts/evaluate-real-repos.ts`](../scripts/evaluate-real-repos.ts)
- Command: `npm run evaluate:repos` (reads `GITHUB_TOKEN` from `.env`)
- `score` = heuristic cleanliness (100 = no findings; `100 − 15·high − 5·med − 2·low`), **not** an accuracy measure.

## Summary table

| # | repo | status | score | total | high | med | low | issue types |
|---|------|--------|-------|-------|------|-----|-----|-------------|
| 1 | adminmart/Modernize-Nextjs-Free | ERR NOT_JS_TS | – | – | – | – | – | no root package.json (app in `package/`) |
| 2 | langfuse/langfuse-js | ok | 83 | 7 | 0 | 1 | 6 | env-var:6, node-engine:1 |
| 3 | open-spaced-repetition/ts-fsrs | ok | 55 | 3 | 3 | 0 | 0 | env-var:2, node-engine:1 |
| 4 | nuxt-modules/apollo | ok | 100 | 0 | 0 | 0 | 0 | — |
| 5 | jihe520/mindpocket | ok | 0 | 26 | 6 | 11 | 9 | env-var:23, package-manager:1, docker:2 |
| 6 | sumitkolhe/jiosaavn-api | ok | 100 | 0 | 0 | 0 | 0 | — |
| 7 | bettergovph/bettergov | ok | 0 | 19 | 6 | 0 | 13 | env-var:19 |
| 8 | Klerith/nest-teslo-shop | ok | 85 | 6 | 0 | 1 | 5 | env-var:5, package-manager:1 |
| 9 | solidjs/templates | ok | 73 | 7 | 1 | 0 | 6 | env-var:7 |
| 10 | sakitam-fdd/wind-layer | ok | 55 | 7 | 1 | 6 | 0 | file-reference:2, env-var:4, package-manager:1 |
| 11 | rpuls/medusajs-2.0-for-railway-boilerplate | ERR NOT_JS_TS | – | – | – | – | – | no root package.json (monorepo) |

Run note: with the token, all repos authenticate (5,000/hr). The initial full
run tripped GitHub's **secondary/abuse** limit from bursting hundreds of parallel
raw fetches; repos 9–10 were re-run with request spacing (`EVAL_DELAY_MS`).

## Per-repo

### 1. adminmart/Modernize-Nextjs-Free — NOT_JS_TS (coverage gap)
- **Expected:** clean npm sanity test.
- **Actual:** rejected — no root `package.json` (root has `package/`, `landingpage/`).
- **TP/FP:** correct rejection per scope (root `package.json` required); a **coverage gap**, not a false positive.
- **Detector:** fetch layer (`NOT_JS_TS`). **Fix:** future — detect an app in a single obvious subdir. **Fixture:** yes — "nested app / no root package.json".

### 2. langfuse/langfuse-js — 7 (0H/1M/6L)
- **Expected:** pnpm monorepo; no pm/command false positives.
- **Actual:** 6× env-var **low** (`.env.example` vars undocumented in README); 1× node-engine **med** ("20+" vs `^20.19 || ^22.13 || >=24`).
- **TP:** the pm/command sanity held (no pm/command findings). Env-var low items are *technically* accurate (rule C) but low value.
- **FP / weak:** node-engine "20+ less strict than engines" is **pedantic** — the README summary isn't wrong. Low-value.
- **Detector:** env-var-drift (rule C noise), node-engine-mismatch. **Fix:** dampen rule-C info noise; be conservative on loose "N+" vs precise multi-range. **Fixture:** optional.

### 3. open-spaced-repetition/ts-fsrs — 3 (3H/0/0)
- **Expected:** Node `>=20` + pnpm; **no** node-engine false positive.
- **Actual:** node-engine **HIGH** "README Node 16 vs engines >=20"; 2× env-var **HIGH** (`NAPI_RS_ASYNC_WORK_POOL_SIZE`, `UV_THREADPOOL_SIZE`).
- **FP (confirmed):** README actually says *"require Node.js `>=20.0.0`"* and *"Node.js 16 and 18 are end-of-life, so we no longer support…"* — the detector read the **EOL/negation** "16" as a requirement. Clear **false positive, HIGH**.
- **FP:** `UV_THREADPOOL_SIZE` (Node built-in) and `NAPI_RS_ASYNC_WORK_POOL_SIZE` (napi-rs internal) in a **vendored `.cjs` binding** — runtime tuning knobs, not app config.
- **Detector:** node-engine-mismatch (negation), env-var-drift (built-ins/vendored). **Fix:** ignore Node versions in EOL/negation context; expand env built-in ignore list; skip vendored/generated files. **Fixture:** **yes (high priority)** — the EOL node case.

### 4. nuxt-modules/apollo — 0
- **Expected:** conservative on vague Node wording.
- **Actual:** clean. **TP:** correct — no false positive from vague Node text. **Fixture:** optional positive case.

### 5. jihe520/mindpocket — 26 (6H/11M/9L) — noisiest
- **Expected:** compose not flagged if present; env only on strong evidence; no unsupported high sev.
- **Actual highlights:**
  - 8× env-var **med** "README documents `POSTGRES_USER`/`DB_HOST`/… but nothing uses it" — **FP:** these are consumed by **docker-compose**, which rule A doesn't count as "usage."
  - 6× env-var **HIGH** (`NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, `WXT_API_BASE`, `MINDPOCKET_SERVER_URL`, `VERCEL_URL`). `VERCEL_URL` is **platform-injected** → FP. The rest are real-but-undocumented monorepo app vars → **arguably TP but HIGH is too strong**.
  - 1× package-manager **med**: README `npm install -g mindpocket` → **FP** (global install of the published CLI, not repo setup).
  - 2× docker-drift **med** (`DB_SSLMODE`, `BETTER_AUTH_URL` compose-required, undocumented) → **plausible TP** (manual review).
  - 9× env-var **low** from a sub-app `.env.example` (rule C noise).
- **Detector:** env-var-drift (rules A/B/C), package-manager-drift. **Fix:** count compose env as usage (rule A); ignore platform vars; skip `install -g <pkg>`. **Fixture:** yes — "documented env used only by compose" + "npm install -g <pkg>".

### 6. sumitkolhe/jiosaavn-api — 0
- **Expected:** compose not flagged if present; bun not mistaken for npm/pnpm.
- **Actual:** clean. **TP:** correct — no docker/bun false positives. **Fixture:** optional positive case.

### 7. bettergovph/bettergov — 19 (6H/0/13L)
- **Expected:** Docker clean case; no docker-drift FP.
- **Actual:** **no docker-drift** (✓ clean). 6× env-var **HIGH** all from `scripts/*.cjs|.js|.ts` and a `manual-security-test.cjs` (`BASE_URL`, `MEILISEARCH_MASTER_KEY`, `PERPLEXITY_API_KEY`, `HREP_SERVICE_*`, `HEAD_COMMIT_HASH`); 13× env-var **low** rule-C from `.env.example`.
- **TP:** docker expectation held. `HEAD_COMMIT_HASH` (CI var) → **FP**; the rest are **build/utility-script** env, undocumented — weak; HIGH is too strong for one-off scripts.
- **Detector:** env-var-drift. **Fix:** deprioritize/exclude `scripts/` for env source scan (like `tests/`); ignore CI/platform vars. **Fixture:** yes — "env used only in scripts/ shouldn't be HIGH".

### 8. Klerith/nest-teslo-shop — 6 (0H/1M/5L)
- **Expected:** pm mismatch may be valid; compose not flagged; `.env.template` counts as env evidence.
- **Actual:** 5× env-var **low** from **`.env.template`** (rule C) — confirms `.env.template` **is** recognized ✓. 1× package-manager **med** "README uses yarn but lockfile is package-lock.json."
- **TP:** the package-manager finding is a **likely true positive** (README documents yarn; only `package-lock.json`). No docker FP (✓).
- **Detector:** package-manager-drift (TP), env-var-drift (rule-C noise). **Fix:** none for pm; dampen rule-C. **Fixture:** yes — good **true-positive** pm case + `.env.template` recognition.

### 9. solidjs/templates — 7 (1H/0/6L)
- **Expected:** README offers npm/pnpm/yarn alternatives → **no** pm drift.
- **Actual:** **no package-manager finding** (✓ alternatives handling works). 1× env-var **HIGH** `PROD` (from `import.meta.env.PROD` — a **Vite built-in**) → **FP**. 6× env-var **low** rule-C across template `.env.example`s.
- **Detector:** env-var-drift. **Fix:** ignore `import.meta.env` built-ins (`PROD`/`DEV`/`MODE`/`SSR`/`BASE_URL`). **Fixture:** yes — the alternatives case (positive) + `import.meta.env.PROD` built-in (negative).

### 10. sakitam-fdd/wind-layer — 7 (1H/6M/0)
- **Expected:** library install/usage examples shouldn't produce command/pm drift.
- **Actual:**
  - 2× file-reference **med**: `maptalks/dist/maptalks.css` (a **node_module asset** in a usage example) and `/data/wind.json` (demo data path) → **FP** (usage-example paths, not repo files).
  - 3× env-var **med**: `YYYYMMDD`, `UGRD`, `VGRD` — **FP** (a date format + meteorological domain terms in prose, not env vars).
  - 1× env-var **HIGH** `MINIFY` (build config `rollup.config.ts`) → weak/FP (build-time env).
  - 1× package-manager **med**: README `yarn add wind-core` → **FP** (library install example, not repo setup).
- **Detector:** file-reference-drift, env-var-drift, package-manager-drift. **Fix:** don't treat `add <pkg>` as pm commitment; tighten SCREAMING_CASE prose env extraction (exclude date/domain tokens); consider ignoring `node_modules`-style asset paths. **Fixture:** yes — the pm `add <pkg>` case + SCREAMING_CASE domain-term case.

### 11. rpuls/medusajs-2.0-for-railway-boilerplate — NOT_JS_TS (coverage gap)
- **Expected:** stress/exploratory; no crash; no unsupported high sev.
- **Actual:** rejected — no root `package.json` (monorepo boilerplate). **No crash, no token/size failure** ✓.
- **TP/FP:** correct rejection; coverage gap (same as #1). **Fixture:** covered by #1's nested-app case.

## Summary

### Detectors producing the most false positives
1. **env-var-drift — by far the worst.** Sources: framework/platform/build **built-in** vars (`VERCEL_URL`, `import.meta.env.PROD`, `UV_THREADPOOL_SIZE`, `NAPI_RS_*`, `MINIFY`, `HEAD_COMMIT_HASH`); **SCREAMING_CASE prose** domain terms (`YYYYMMDD`, `UGRD`, `VGRD`); **rule A** not counting docker-compose usage (`POSTGRES_*`, `DB_*`); **rule C** info-flood; no `scripts/` exclusion.
2. **package-manager-drift** — **library install examples** (`install -g <pkg>`, `add <pkg>`) read as repo setup.
3. **node-engine-mismatch** — **EOL/negation** context ("Node.js 16 … end-of-life") read as a requirement (a HIGH false positive).
4. **file-reference-drift** — **usage-example asset paths** (`maptalks/dist/maptalks.css`).
- **Clean detectors:** docker-drift (no false positives; the Docker "clean" repos passed), command-drift (0 findings — the earlier `cd`/generator fixes held).

### Top 5 false positives to fix first
1. **env-var built-ins/platform vars** — expand the ignore list (`VERCEL_URL`, `CI`, `NODE_OPTIONS`, `UV_THREADPOOL_SIZE`, `npm_*`) and ignore `import.meta.env` built-ins (`PROD/DEV/MODE/SSR/BASE_URL`); skip vendored/generated files. *(ts-fsrs, solidjs, mindpocket, wind-layer)*
2. **env-var rule A vs docker-compose** — count compose `environment`/required keys as "usage" so documented DB vars aren't "documented but unused." *(mindpocket ×8)*
3. **package-manager library-install examples** — ignore `install -g <pkg>` and `add <pkg>` (a package argument ⇒ not repo setup). *(mindpocket, wind-layer)*
4. **node-engine EOL/negation** — ignore Node versions stated as unsupported/end-of-life; prefer the explicit requirement. *(ts-fsrs — a HIGH false positive)*
5. **env-var SCREAMING_CASE prose over-match** — exclude date/domain tokens (`YYYYMMDD`, `UGRD`, `VGRD`) and dampen rule-C info-noise. *(wind-layer, and the pervasive low-severity flood)*

### Repos to promote to permanent regression fixtures
- **ts-fsrs** — Node EOL negation → expect **no** node-engine finding *(highest value: a HIGH false positive)*.
- **mindpocket** — README-documented DB env used only by docker-compose → expect no "documented but unused"; and `npm install -g <pkg>` → no pm drift.
- **wind-layer** — `yarn add <pkg>` library install → no pm drift; SCREAMING_CASE domain terms → no env-var.
- **solidjs/templates** — pm "alternatives" (positive: stays clean) + `import.meta.env.PROD` built-in (negative).
- **Klerith/nest-teslo-shop** — a **true-positive** pm case (yarn vs `package-lock.json`) + `.env.template` recognition.
- **nuxt-modules/apollo** / **sumitkolhe/jiosaavn-api** — positive "stays clean" cases.
- **adminmart / medusajs** — nested-app / no-root-`package.json` handling.

### Do any high-severity findings look trustworthy?
**Largely no.** Every HIGH in this corpus came from env-var-drift "source reads X undocumented" or the node-engine EOL false positive, and the HIGHs were dominated by platform/build/vendored vars (`VERCEL_URL`, `UV_THREADPOOL_SIZE`, `MINIFY`, script vars) or the ts-fsrs negation FP. The closest to real are mindpocket's `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` (genuinely undocumented app config) — but **HIGH is too strong** for optional public vars. **Recommendation: env-var-drift should not emit HIGH without stronger evidence** (e.g., required + used at runtime + no default), and the current HIGH tier should be treated as "manual review needed."
