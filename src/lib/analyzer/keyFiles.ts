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

// A path segment that marks a test/fixture directory, or a `*.test.*`/`*.spec.*`
// filename. Files under these aren't the app's real config surface, so the
// source/env scanners skip them (e.g. fake repos under `tests/fixtures/`).
const TEST_DIR_RE = /(^|\/)(tests?|__tests__|__mocks__|__fixtures__|fixtures|e2e|cypress)(\/|$)/i;
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

export function isTestPath(path: string): boolean {
  return TEST_DIR_RE.test(path) || TEST_FILE_RE.test(path);
}

// Build output / vendored / generated code — not the app's authored source.
const GENERATED_DIR_RE = /(^|\/)(dist|build|out|coverage|vendor|generated|__generated__|\.next|\.nuxt|\.output)(\/|$)/i;
const GENERATED_FILE_RE = /\.min\.[cm]?jsx?$/i;

export function isGeneratedPath(path: string): boolean {
  return GENERATED_DIR_RE.test(path) || GENERATED_FILE_RE.test(path);
}
