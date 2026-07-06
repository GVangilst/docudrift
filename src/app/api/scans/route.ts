import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import { ScanError, SCAN_ERROR_STATUS } from '@/lib/github/errors';
import { fetchRepoSnapshot } from '@/lib/github/fetchRepoSnapshot';
import { buildReport } from '@/lib/report';
import { parseRepoUrl } from '@/lib/github/parseRepoUrl';

export const runtime = 'nodejs';

const SCAN_BUDGET_MS = 30_000;

/** Rejects with a TIMEOUT ScanError if the scan exceeds the wall-clock budget. */
function withBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ScanError('TIMEOUT', 'The scan took too long.')), ms),
    ),
  ]);
}

function errorResponse(error: ScanError): Response {
  const headers: Record<string, string> = {};
  const retryAfter = error.meta?.retryAfterSeconds;
  if (typeof retryAfter === 'number') headers['Retry-After'] = String(retryAfter);
  return Response.json(
    { error: { code: error.code, message: error.message, ...(error.meta ?? {}) } },
    { status: SCAN_ERROR_STATUS[error.code], headers },
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as { repoUrl?: unknown } | null;
    if (!body || typeof body.repoUrl !== 'string') {
      throw new ScanError('INVALID_URL', 'Request body must include a "repoUrl" string.');
    }

    const { owner, repo } = parseRepoUrl(body.repoUrl);
    const fetched = await withBudget(fetchRepoSnapshot(owner, repo), SCAN_BUDGET_MS);
    const issues = analyzeRepository(fetched.snapshot);
    const report = buildReport(
      {
        owner,
        name: repo,
        defaultBranch: fetched.defaultBranch,
        commitSha: fetched.commitSha,
        truncated: fetched.truncated,
      },
      issues,
    );

    return Response.json(report);
  } catch (error) {
    if (error instanceof ScanError) return errorResponse(error);
    return Response.json(
      { error: { code: 'GITHUB_UPSTREAM_ERROR', message: 'Unexpected error while scanning.' } },
      { status: 500 },
    );
  }
}
