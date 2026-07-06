import { collectDockerInfo } from './docker';
import {
  extractEnvUsagesFromSource,
  extractEnvVarsFromExample,
  isEnvExampleFile,
  isSourceFile,
} from './envVars';
import { LOCKFILE_MANAGERS, isTestPath } from './keyFiles';
import { collectNodeVersionRequirements } from './nodeVersions';
import { getRootFile } from './repoSnapshot';
import type { EnvVarOccurrence, LockfileInfo, PackageManager, RepoSnapshot, TruthModel } from './types';

/**
 * Derives ground-truth facts about the repo from its actual files.
 * Never throws — a malformed package.json yields packageJson: null rather
 * than failing the whole scan.
 */
export function buildTruthModel(snapshot: RepoSnapshot): TruthModel {
  const packageJsonFile = getRootFile(snapshot, 'package.json');
  let packageJson: TruthModel['packageJson'] = null;
  let voltaNode: string | null = null;

  if (packageJsonFile) {
    try {
      const parsed = JSON.parse(packageJsonFile.content) as {
        scripts?: Record<string, string>;
        engines?: Record<string, string>;
        version?: string;
        license?: string;
        volta?: { node?: string };
      };

      packageJson = {
        scripts: parsed.scripts ?? {},
        engines: parsed.engines ?? {},
        version: parsed.version ?? null,
        license: parsed.license ?? null,
      };
      voltaNode = parsed.volta?.node ?? null;
    } catch {
      packageJson = null;
    }
  }

  // Existence checks use the full tree when available; fixtures (no allPaths)
  // fall back to the fetched files, which for them is every file.
  const filePaths = snapshot.allPaths ?? snapshot.files.map((file) => file.path);
  const rootFiles = filePaths.filter((path) => !path.includes('/'));

  const envVarsFromExamples: EnvVarOccurrence[] = [];
  const envVarsFromCode: EnvVarOccurrence[] = [];
  for (const file of snapshot.files) {
    // Skip test/fixture files — they aren't the app's real env config.
    if (isTestPath(file.path)) continue;
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

  const nodeVersionRequirements = collectNodeVersionRequirements(
    snapshot,
    packageJson?.engines?.node ?? null,
    voltaNode,
  );

  return {
    packageJson,
    hasRootServerJs: rootFiles.includes('server.js'),
    rootFiles,
    filePaths,
    envVarsFromExamples,
    envVarsFromCode,
    lockfiles,
    packageManager,
    nodeVersionRequirements,
    docker: collectDockerInfo(snapshot),
  };
}
