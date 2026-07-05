import type { RepoFile, RepoSnapshot } from './types';

function isRootFile(path: string): boolean {
  return !path.includes('/');
}

/** Finds a file at repo root by exact, case-sensitive path (e.g. "package.json"). */
export function getRootFile(snapshot: RepoSnapshot, path: string): RepoFile | undefined {
  return snapshot.files.find((file) => file.path === path);
}

/** Finds a root-level file by case-insensitive name (e.g. "README.md" vs "readme.md"). */
export function findRootFileCaseInsensitive(
  snapshot: RepoSnapshot,
  name: string,
): RepoFile | undefined {
  const lower = name.toLowerCase();
  return snapshot.files.find(
    (file) => isRootFile(file.path) && file.path.toLowerCase() === lower,
  );
}

export function listRootFilePaths(snapshot: RepoSnapshot): string[] {
  return snapshot.files.map((file) => file.path).filter(isRootFile);
}
