import {
  extractEnvUsagesFromSource,
  extractEnvVarsFromExample,
  isEnvExampleFile,
  isSourceFile,
} from './envVars';
import { getRootFile, listRootFilePaths } from './repoSnapshot';
import type {
  EnvVarOccurrence,
  LockfileInfo,
  PackageManager,
  RepoSnapshot,
  TruthModel,
} from './types';

// Lockfile name → the package manager it implies.
const LOCKFILE_MANAGERS: { file: string; manager: PackageManager }[] = [
  { file: 'package-lock.json', manager: 'npm' },
  { file: 'npm-shrinkwrap.json', manager: 'npm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'bun.lock', manager: 'bun' },
  { file: 'bun.lockb', manager: 'bun' },
];

/**
 * Derives ground-truth facts about the repo from its actual files.
 * Never throws — a malformed package.json yields packageJson: null rather
 * than failing the whole scan.
 */
export function buildTruthModel(snapshot: RepoSnapshot): TruthModel {
  const packageJsonFile = getRootFile(snapshot, 'package.json');
  let packageJson: TruthModel['packageJson'] = null;

  if (packageJsonFile) {
    try {
      const parsed = JSON.parse(packageJsonFile.content) as {
        scripts?: Record<string, string>;
        engines?: Record<string, string>;
        version?: string;
        license?: string;
      };

      packageJson = {
        scripts: parsed.scripts ?? {},
        engines: parsed.engines ?? {},
        version: parsed.version ?? null,
        license: parsed.license ?? null,
      };
    } catch {
      packageJson = null;
    }
  }

  const rootFiles = listRootFilePaths(snapshot);

  const envVarsFromExamples: EnvVarOccurrence[] = [];
  const envVarsFromCode: EnvVarOccurrence[] = [];
  for (const file of snapshot.files) {
    if (isEnvExampleFile(file.path)) {
      envVarsFromExamples.push(...extractEnvVarsFromExample(file));
    } else if (isSourceFile(file.path)) {
      envVarsFromCode.push(...extractEnvUsagesFromSource(file));
    }
  }

  const lockfiles: LockfileInfo[] = LOCKFILE_MANAGERS.filter(({ file }) =>
    rootFiles.includes(file),
  ).map(({ file, manager }) => ({ file, manager }));

  const lockfileManagers = new Set(lockfiles.map((lock) => lock.manager));
  const packageManager: PackageManager | null =
    lockfileManagers.size === 1 ? [...lockfileManagers][0] : null;

  return {
    packageJson,
    hasRootServerJs: rootFiles.includes('server.js'),
    rootFiles,
    filePaths: snapshot.files.map((file) => file.path),
    envVarsFromExamples,
    envVarsFromCode,
    lockfiles,
    packageManager,
  };
}
