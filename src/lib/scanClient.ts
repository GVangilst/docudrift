import type { ScanReport } from './report';

export type ScanClientError = { code: string; message: string };

/** Thrown by runScan when the API returns a non-2xx `{ error: {...} }` body. */
export class ScanFailed extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScanFailed';
    this.code = code;
  }
}

/** POSTs a repo URL to /api/scans and returns the report, or throws ScanFailed. */
export async function runScan(repoUrl: string): Promise<ScanReport> {
  let response: Response;
  try {
    response = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoUrl }),
    });
  } catch {
    throw new ScanFailed('NETWORK', 'Could not reach the server. Check your connection.');
  }

  const body = (await response.json().catch(() => null)) as
    | ScanReport
    | { error?: ScanClientError }
    | null;

  if (!response.ok || !body || 'error' in body) {
    const error = (body && 'error' in body ? body.error : null) ?? {
      code: 'UNKNOWN',
      message: 'The scan failed unexpectedly.',
    };
    throw new ScanFailed(error.code, error.message);
  }

  return body as ScanReport;
}
