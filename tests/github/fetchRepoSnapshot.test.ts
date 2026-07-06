import { describe, expect, it } from 'vitest';
import { fetchRepoSnapshot } from '@/lib/github/fetchRepoSnapshot';
import { ScanError } from '@/lib/github/errors';
import { fakeFetch, jsonResponse, textResponse } from '../helpers/fakeFetch';

function happyRoutes(overrides: Record<string, Parameters<typeof fakeFetch>[0][string]> = {}) {
  return {
    '/repos/o/r/branches/main': jsonResponse({ commit: { sha: 'abc123' } }),
    '/repos/o/r/git/trees/abc123': jsonResponse({
      truncated: false,
      tree: [
        { path: 'package.json', type: 'blob', size: 60 },
        { path: 'README.md', type: 'blob', size: 40 },
      ],
    }),
    // Listed last so the more specific /branches and /trees routes match first.
    '/repos/o/r': jsonResponse({ default_branch: 'main' }),
    '/o/r/abc123/package.json': textResponse('{"name":"x","scripts":{"dev":"vite"}}'),
    '/o/r/abc123/README.md': textResponse('# x\n\nRun `npm run dev`.'),
    ...overrides,
  };
}

describe('fetchRepoSnapshot', () => {
  it('builds a snapshot with selected files and repo metadata', async () => {
    const result = await fetchRepoSnapshot('o', 'r', fakeFetch(happyRoutes()));

    expect(result.defaultBranch).toBe('main');
    expect(result.commitSha).toBe('abc123');
    expect(result.truncated).toBe(false);
    expect(result.snapshot.repo).toEqual({ owner: 'o', name: 'r' });

    const paths = result.snapshot.files.map((f) => f.path).sort();
    expect(paths).toEqual(['README.md', 'package.json']);
    expect(result.snapshot.files.find((f) => f.path === 'package.json')?.content).toContain('vite');
  });

  it('captures the full tree in allPaths, including un-fetched files', async () => {
    const routes = happyRoutes({
      '/repos/o/r/git/trees/abc123': jsonResponse({
        truncated: false,
        tree: [
          { path: 'package.json', type: 'blob', size: 60 },
          { path: 'README.md', type: 'blob', size: 40 },
          { path: 'docs/guide.md', type: 'blob', size: 20 },
          { path: 'docs', type: 'tree' },
        ],
      }),
    });
    const result = await fetchRepoSnapshot('o', 'r', fakeFetch(routes));

    // docs/guide.md is in the tree even though we only fetch key-file content.
    expect(result.snapshot.allPaths).toEqual(['package.json', 'README.md', 'docs/guide.md']);
  });

  it('flags a truncated tree', async () => {
    const routes = happyRoutes({
      '/repos/o/r/git/trees/abc123': jsonResponse({
        truncated: true,
        tree: [{ path: 'package.json', type: 'blob', size: 60 }],
      }),
    });
    const result = await fetchRepoSnapshot('o', 'r', fakeFetch(routes));
    expect(result.truncated).toBe(true);
  });

  it('rejects a repo without a root package.json as NOT_JS_TS', async () => {
    const routes = happyRoutes({
      '/repos/o/r/git/trees/abc123': jsonResponse({
        truncated: false,
        tree: [{ path: 'main.py', type: 'blob', size: 10 }],
      }),
    });
    await expect(fetchRepoSnapshot('o', 'r', fakeFetch(routes))).rejects.toMatchObject({
      code: 'NOT_JS_TS',
    });
  });

  it('maps a 404 to REPO_NOT_FOUND', async () => {
    const routes = { '/repos/o/r': new Response('', { status: 404 }) };
    await expect(fetchRepoSnapshot('o', 'r', fakeFetch(routes))).rejects.toMatchObject({
      code: 'REPO_NOT_FOUND',
    });
  });

  it('maps a 403 rate-limit to RATE_LIMITED with a reset time', async () => {
    const routes = {
      '/repos/o/r': new Response('', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' },
      }),
    };
    try {
      await fetchRepoSnapshot('o', 'r', fakeFetch(routes));
      throw new Error('expected a ScanError');
    } catch (error) {
      expect(error).toBeInstanceOf(ScanError);
      expect((error as ScanError).code).toBe('RATE_LIMITED');
      expect((error as ScanError).meta?.resetAt).toBe(1700000000);
    }
  });

  it('maps a 429 (secondary rate limit) to RATE_LIMITED with retry-after', async () => {
    const routes = {
      '/repos/o/r': new Response('', { status: 429, headers: { 'retry-after': '60' } }),
    };
    await expect(fetchRepoSnapshot('o', 'r', fakeFetch(routes))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      meta: { retryAfterSeconds: 60 },
    });
  });

  it('maps a 403 with Retry-After (abuse limit, no remaining header) to RATE_LIMITED', async () => {
    const routes = {
      '/repos/o/r': new Response('', { status: 403, headers: { 'retry-after': '30' } }),
    };
    await expect(fetchRepoSnapshot('o', 'r', fakeFetch(routes))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});
