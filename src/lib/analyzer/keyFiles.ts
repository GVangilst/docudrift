import type { PackageManager } from './types';

/** Lockfile name → the package manager it implies. Shared by the truth model
 *  (which manager) and the fetch layer (which files to download). */
export const LOCKFILE_MANAGERS: { file: string; manager: PackageManager }[] = [
  { file: 'package-lock.json', manager: 'npm' },
  { file: 'npm-shrinkwrap.json', manager: 'npm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'bun.lock', manager: 'bun' },
  { file: 'bun.lockb', manager: 'bun' },
];

/** Set of lockfile basenames, for quick membership checks during file selection. */
export const LOCKFILE_NAMES = new Set(LOCKFILE_MANAGERS.map((lock) => lock.file));

/** Root files carrying a Node.js version requirement (parsed in nodeVersions.ts). */
export const NODE_VERSION_FILES = new Set(['.nvmrc', '.node-version', '.tool-versions']);

// A path segment that marks a test/fixture directory, or a test-ish filename
// (`*.test.*`, `*.spec.*`, or a `-test`/`_test`/`-spec`/`-e2e` suffix). Files
// under these aren't the app's real config surface, so the source/env scanners
// skip them (e.g. fake repos under `tests/fixtures/`, `manual-security-test.cjs`).
const TEST_DIR_RE = /(^|\/)(tests?|__tests__|__mocks__|__fixtures__|__checks__|fixtures|e2e|cypress)(\/|$)/i;
// `*.test.*` / `*.spec.*` / `*-test.*` / `*_spec.*`, plus a bare `test.ts` /
// `spec.js` / `e2e.ts` file (some repos co-locate a single `test.ts`).
const TEST_FILE_RE = /(^|\/|\.|[-_])(test|spec|e2e)\.[cm]?[jt]sx?$/i;

export function isTestPath(path: string): boolean {
  return TEST_DIR_RE.test(path) || TEST_FILE_RE.test(path);
}

// Build output / vendored / generated code — not the app's authored source.
const GENERATED_DIR_RE = /(^|\/)(dist|build|out|coverage|vendor|generated|__generated__|\.next|\.nuxt|\.output)(\/|$)/i;
const GENERATED_FILE_RE = /\.min\.[cm]?jsx?$/i;

export function isGeneratedPath(path: string): boolean {
  return GENERATED_DIR_RE.test(path) || GENERATED_FILE_RE.test(path);
}

// Non-app source: build tooling, scripts, CI, examples, benchmarks, docs. Reads
// env at build/CI/demo time, not as app runtime config a README documents. Used
// to down-scope the high-severity "source reads X" env rule (still counts as
// "usage" for the documented-but-unused and compose checks).
const TOOLING_DIR_RE =
  /(^|\/)(scripts|\.github|\.devcontainer|examples?|demos?|benchmarks?|benchmarking|dev-docs)(\/|$)/i;
// Known bundler / build / test / lint / docs tool config files, at any depth
// (monorepo packages have their own). Deliberately an allowlist, NOT any
// `*.config.*`, so application config modules like `src/app.config.ts` or
// `database.config.ts` (which are real runtime config) are still scanned.
const BUILD_TOOL_CONFIGS =
  'rollup|rolldown|vite|vitest|webpack|rspack|esbuild|tsup|next|nuxt|svelte|astro|remix|gatsby|metro|docusaurus|babel|jest|playwright|cypress|karma|tailwind|postcss|eslint|prettier|stylelint|commitlint|lint-staged';
const TOOLING_FILE_RE = new RegExp(`(^|/)(?:${BUILD_TOOL_CONFIGS})\\.config\\.[cm]?[jt]s$`, 'i');

export function isToolingPath(path: string): boolean {
  return TOOLING_DIR_RE.test(path) || TOOLING_FILE_RE.test(path);
}
