import { collectDockerInfo } from './docker';
import { extractEnvVarsFromExample, isEnvExampleFile } from './envVars';
import { LOCKFILE_MANAGERS } from './keyFiles';
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

  // Env vars declared in `.env.example` files — the repo's structured, declared
  // config surface. (We intentionally do NOT scan arbitrary source for
  // `process.env.X`: deciding which files are "the app" is an unbounded
  // directory-classification problem, so that check was removed.)
  const envVarsFromExamples: EnvVarOccurrence[] = [];
  for (const file of snapshot.files) {
    if (isEnvExampleFile(file.path)) {
      envVarsFromExamples.push(...extractEnvVarsFromExample(file));
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
    lockfiles,
    packageManager,
    nodeVersionRequirements,
    docker: collectDockerInfo(snapshot),
  };
}
