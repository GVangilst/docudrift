import { isDockerfile, isComposeFile } from '../analyzer/docker';
import { isEnvExampleFile } from '../analyzer/envVars';
import { LOCKFILE_NAMES, NODE_VERSION_FILES } from '../analyzer/keyFiles';

/** A blob/tree entry from GitHub's recursive git-tree response. */
export type TreeEntry = { path: string; type: string; size?: number };

// Skip any single file larger than this to avoid pathological blobs.
const MAX_FILE_BYTES = 1_000_000;

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

function isRoot(path: string): boolean {
  return !path.includes('/');
}

/** The structured/doc files the analyzer needs the content of. */
function isKeyFile(path: string): boolean {
  const base = basename(path);
  if (isRoot(path)) {
    if (/^readme\.md$/i.test(base)) return true;
    if (base === 'package.json') return true;
    if (LOCKFILE_NAMES.has(base) || NODE_VERSION_FILES.has(base)) return true;
  }
  return isEnvExampleFile(path) || isDockerfile(path) || isComposeFile(path);
}

/**
 * From a repo's recursive tree, selects the bounded set of file paths whose
 * *content* the analyzer needs: README, package.json, lockfiles, node-version
 * files, `.env.example`s, and Docker/compose files. Arbitrary source is NOT
 * fetched — no detector reads it (file existence is checked against the full
 * tree). Oversized blobs are skipped.
 */
export function selectKeyFiles(entries: TreeEntry[]): string[] {
  return entries
    .filter(
      (entry) =>
        entry.type === 'blob' && (entry.size ?? 0) <= MAX_FILE_BYTES && isKeyFile(entry.path),
    )
    .map((entry) => entry.path);
}
