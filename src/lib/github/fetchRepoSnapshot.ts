import type { RepoFile, RepoSnapshot } from '../analyzer/types';
import { ScanError } from './errors';
import { selectKeyFiles, type TreeEntry } from './fileSelection';
import { githubApi, githubRaw, type FetchFn } from './githubClient';

export type FetchedRepo = {
  snapshot: RepoSnapshot;
  defaultBranch: string;
  commitSha: string;
  truncated: boolean;
};

type RepoMeta = { default_branch: string };
type BranchMeta = { commit: { sha: string } };
type TreeResponse = { tree: TreeEntry[]; truncated: boolean };

const RAW_FETCH_CONCURRENCY = 10;

/** Runs `fn` over `items` with at most `limit` promises in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Fetches a public GitHub repo into a RepoSnapshot the analyzer can consume.
 * Uses 3 API calls (repo → branch → tree) plus one raw.githubusercontent.com
 * download per selected file (raw doesn't count against the API rate limit).
 */
export async function fetchRepoSnapshot(
  owner: string,
  repo: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<FetchedRepo> {
  const meta = await githubApi<RepoMeta>(`/repos/${owner}/${repo}`, fetchFn);
  const branch = await githubApi<BranchMeta>(
    `/repos/${owner}/${repo}/branches/${meta.default_branch}`,
    fetchFn,
  );
  const commitSha = branch.commit.sha;

  const tree = await githubApi<TreeResponse>(
    `/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
    fetchFn,
  );

  const hasPackageJson = tree.tree.some(
    (entry) => entry.path === 'package.json' && entry.type === 'blob',
  );
  if (!hasPackageJson) {
    throw new ScanError(
      'NOT_JS_TS',
      'DocuDrift only supports JavaScript/TypeScript repositories (no root package.json found).',
    );
  }

  const paths = selectKeyFiles(tree.tree);
  // Bounded concurrency: hundreds of simultaneous raw fetches can trip GitHub's
  // secondary (abuse) rate limit, so cap how many are in flight at once.
  const fetched = await mapWithConcurrency(paths, RAW_FETCH_CONCURRENCY, async (path) => {
    const content = await githubRaw(owner, repo, commitSha, path, fetchFn);
    return content === null ? null : { path, content };
  });

  return {
    snapshot: {
      repo: { owner, name: repo },
      files: fetched.filter((file): file is RepoFile => file !== null),
      // Full tree, so existence checks (dead links, lockfiles) see every file,
      // not just the bounded set whose content we downloaded.
      allPaths: tree.tree
        .filter((entry) => entry.type === 'blob')
        .map((entry) => entry.path),
    },
    defaultBranch: meta.default_branch,
    commitSha,
    truncated: tree.truncated,
  };
}
