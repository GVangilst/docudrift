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
  const fetched = await Promise.all(
    paths.map(async (path): Promise<RepoFile | null> => {
      const content = await githubRaw(owner, repo, commitSha, path, fetchFn);
      return content === null ? null : { path, content };
    }),
  );

  return {
    snapshot: {
      repo: { owner, name: repo },
      files: fetched.filter((file): file is RepoFile => file !== null),
    },
    defaultBranch: meta.default_branch,
    commitSha,
    truncated: tree.truncated,
  };
}
