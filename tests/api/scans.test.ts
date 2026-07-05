import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/scans/route';
import { fakeFetch, jsonResponse, textResponse } from '../helpers/fakeFetch';

function scanRequest(repoUrl: unknown): Request {
  return new Request('http://localhost/api/scans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoUrl }),
  });
}

function stubGitHub(tree: { path: string; type: string; size?: number }[], files: Record<string, string>) {
  const routes: Record<string, Response | (() => Response)> = {
    '/repos/o/r/branches/main': jsonResponse({ commit: { sha: 'sha1' } }),
    '/repos/o/r/git/trees/sha1': jsonResponse({ truncated: false, tree }),
    '/repos/o/r': jsonResponse({ default_branch: 'main' }),
  };
  for (const [path, content] of Object.entries(files)) {
    routes[`/o/r/sha1/${path}`] = textResponse(content);
  }
  vi.stubGlobal('fetch', fakeFetch(routes));
}

describe('POST /api/scans', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a drift report with severity summary', async () => {
    stubGitHub(
      [
        { path: 'package.json', type: 'blob', size: 30 },
        { path: 'README.md', type: 'blob', size: 30 },
      ],
      {
        'package.json': '{"name":"x"}',
        'README.md': '# x\n\nRun `npm run dev`.',
      },
    );

    const response = await POST(scanRequest('https://github.com/o/r'));
    expect(response.status).toBe(200);

    const report = await response.json();
    expect(report.repo).toEqual({
      owner: 'o',
      name: 'r',
      defaultBranch: 'main',
      commitSha: 'sha1',
    });
    expect(report.summary.error).toBe(1); // documented `npm run dev` with no dev script
    expect(report.findings[0].detectorId).toBe('command-drift');
  });

  it('rejects an invalid URL with 400 INVALID_URL', async () => {
    const response = await POST(scanRequest('not-a-github-url'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_URL');
  });

  it('rejects a non-JS/TS repo with 422 NOT_JS_TS', async () => {
    stubGitHub([{ path: 'main.py', type: 'blob', size: 10 }], {});
    const response = await POST(scanRequest('https://github.com/o/r'));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('NOT_JS_TS');
  });

  it('maps a GitHub 404 to 404 REPO_NOT_FOUND', async () => {
    vi.stubGlobal('fetch', fakeFetch({ '/repos/o/r': new Response('', { status: 404 }) }));
    const response = await POST(scanRequest('https://github.com/o/r'));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('REPO_NOT_FOUND');
  });
});
