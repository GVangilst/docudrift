/** Machine-readable error codes surfaced to the API client. */
export type ScanErrorCode =
  | 'INVALID_URL'
  | 'REPO_NOT_FOUND'
  | 'NOT_JS_TS'
  | 'RATE_LIMITED'
  | 'REPO_TOO_LARGE'
  | 'GITHUB_UPSTREAM_ERROR'
  | 'TIMEOUT';

/** An error with a stable code that maps to a specific HTTP status. */
export class ScanError extends Error {
  readonly code: ScanErrorCode;
  readonly meta?: Record<string, unknown>;

  constructor(code: ScanErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    this.meta = meta;
  }
}

/** HTTP status for each error code. */
export const SCAN_ERROR_STATUS: Record<ScanErrorCode, number> = {
  INVALID_URL: 400,
  NOT_JS_TS: 422,
  REPO_NOT_FOUND: 404,
  RATE_LIMITED: 429,
  REPO_TOO_LARGE: 413,
  GITHUB_UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
};
