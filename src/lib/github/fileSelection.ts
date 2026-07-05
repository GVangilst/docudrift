import { isDockerfile, isComposeFile } from '../analyzer/docker';
import { isEnvExampleFile, isSourceFile } from '../analyzer/envVars';
import { LOCKFILE_NAMES, NODE_VERSION_FILES } from '../analyzer/keyFiles';

/** A blob/tree entry from GitHub's recursive git-tree response. */
export type TreeEntry = { path: string; type: string; size?: number };

// Skip any single file larger than this, and cap total source bytes/count so a
// pathological repo can't blow up memory or the request budget.
const MAX_FILE_BYTES = 1_000_000;
const MAX_SOURCE_FILES = 200;
const MAX_TOTAL_SOURCE_BYTES = 2_000_000;

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

function isRoot(path: string): boolean {
  return !path.includes('/');
}

/** Config/doc files the analyzer always wants, regardless of caps. */
function isAlwaysIncluded(path: string): boolean {
  const base = basename(path);
  if (isRoot(path)) {
    if (/^readme\.md$/i.test(base)) return true;
    if (base === 'package.json') return true;
    if (LOCKFILE_NAMES.has(base) || NODE_VERSION_FILES.has(base)) return true;
  }
  return isEnvExampleFile(path) || isDockerfile(path) || isComposeFile(path);
}

/**
 * From a repo's recursive tree, selects the bounded set of file paths to fetch:
 * all key config/doc files, plus source files (preferring `src/**`) capped by
 * count and total bytes. Oversized blobs are skipped.
 */
export function selectKeyFiles(entries: TreeEntry[]): string[] {
  const blobs = entries.filter(
    (entry) => entry.type === 'blob' && (entry.size ?? 0) <= MAX_FILE_BYTES,
  );

  const selected = new Set<string>();
  for (const entry of blobs) {
    if (isAlwaysIncluded(entry.path)) selected.add(entry.path);
  }

  const sources = blobs
    .filter((entry) => isSourceFile(entry.path) && !selected.has(entry.path))
    .sort((a, b) => {
      const aSrc = a.path.startsWith('src/') ? 0 : 1;
      const bSrc = b.path.startsWith('src/') ? 0 : 1;
      return aSrc - bSrc || a.path.localeCompare(b.path);
    });

  let count = 0;
  let bytes = 0;
  for (const entry of sources) {
    const size = entry.size ?? 0;
    if (count >= MAX_SOURCE_FILES || bytes + size > MAX_TOTAL_SOURCE_BYTES) break;
    selected.add(entry.path);
    count += 1;
    bytes += size;
  }

  return [...selected];
}
