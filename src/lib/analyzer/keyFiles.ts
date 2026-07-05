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
