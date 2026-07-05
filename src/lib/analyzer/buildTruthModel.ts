import { getRootFile, listRootFilePaths } from './repoSnapshot';
import type { RepoSnapshot, TruthModel } from './types';

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

  return {
    packageJson,
    hasRootServerJs: rootFiles.includes('server.js'),
    rootFiles,
  };
}
