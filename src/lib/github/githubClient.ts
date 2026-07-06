import { ScanError } from './errors';

export type FetchFn = typeof fetch;

const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';
const REQUEST_TIMEOUT_MS = 10_000;

function headers(): Record<string, string> {
  const base: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'docudrift',
  };
  // Optional, server-side only. Raises the 60/hr unauth limit; never exposed.
  const token = process.env.GITHUB_TOKEN;
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

/**
 * GitHub signals rate limiting two ways: the primary limit is a `403` with
 * `X-RateLimit-Remaining: 0`; the secondary/abuse limit is a `429` (or a `403`
 * carrying a `Retry-After` header).
 */
function isRateLimited(response: Response): boolean {
  if (response.status === 429) return true;
  if (response.status === 403) {
    return (
      response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')
    );
  }
  return false;
}

function mapErrorResponse(response: Response): ScanError {
  if (response.status === 404) {
    // Unauthenticated requests can't tell private from non-existent — both 404.
    return new ScanError('REPO_NOT_FOUND', 'Repository not found, or it is private.');
  }
  if (isRateLimited(response)) {
    const retryAfter = response.headers.get('retry-after');
    const reset = response.headers.get('x-ratelimit-reset');
    return new ScanError(
      'RATE_LIMITED',
      'GitHub API rate limit exceeded. Wait a bit and retry, or set a GITHUB_TOKEN to raise the limit.',
      {
        retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined,
        resetAt: reset ? Number(reset) : undefined,
      },
    );
  }
  return new ScanError('GITHUB_UPSTREAM_ERROR', `GitHub API returned ${response.status}.`);
}

/** Fetches and JSON-parses an api.github.com path, mapping failures to ScanError. */
export async function githubApi<T>(path: string, fetchFn: FetchFn = globalThis.fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(`${API_BASE}${path}`, {
      headers: headers(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) throw new ScanError('TIMEOUT', 'The GitHub request timed out.');
    throw new ScanError('GITHUB_UPSTREAM_ERROR', 'Could not reach the GitHub API.');
  }
  if (!response.ok) throw mapErrorResponse(response);
  return (await response.json()) as T;
}

/**
 * Fetches raw file content from raw.githubusercontent.com. Raw does not count
 * against the API rate limit, so file downloads stay cheap. Returns null for a
 * 404 (file listed in the tree but not fetchable) so one missing blob doesn't
 * fail the scan.
 */
export async function githubRaw(
  owner: string,
  repo: string,
  sha: string,
  path: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchFn(`${RAW_BASE}/${owner}/${repo}/${sha}/${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) throw new ScanError('TIMEOUT', 'A file download timed out.');
    throw new ScanError('GITHUB_UPSTREAM_ERROR', 'Could not download repository files.');
  }
  if (response.status === 404) return null;
  if (!response.ok) throw mapErrorResponse(response);
  return response.text();
}
