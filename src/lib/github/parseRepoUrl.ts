import { ScanError } from './errors';

// github.com/<owner>/<repo>, optionally with scheme, www., .git, or trailing
// path (e.g. /tree/main). Owner/repo are captured; anything after is ignored.
const GITHUB_URL_RE =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/#?].*)?$/i;

/**
 * Parses a public GitHub repo URL into `{ owner, repo }`. This is the SSRF
 * boundary: the raw user input is only ever pattern-matched here; callers build
 * api.github.com / raw.githubusercontent.com URLs from the validated parts and
 * never fetch the input URL directly.
 */
export function parseRepoUrl(input: string): { owner: string; repo: string } {
  const match = GITHUB_URL_RE.exec(input.trim());
  if (!match) {
    throw new ScanError(
      'INVALID_URL',
      'Enter a public GitHub repository URL like https://github.com/owner/repo.',
    );
  }
  return { owner: match[1], repo: match[2] };
}
