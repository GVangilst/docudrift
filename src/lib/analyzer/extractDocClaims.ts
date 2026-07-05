import { findRootFileCaseInsensitive } from './repoSnapshot';
import type {
  DocClaim,
  DocClaimSource,
  FileReferenceClaim,
  NpmScriptClaim,
  RepoSnapshot,
} from './types';

const RUN_SCRIPT_RE = /\bnpm\s+run(?:-script)?\s+([a-zA-Z0-9_:.-]+)/g;
const START_RE = /\bnpm\s+start\b/;
const TEST_RE = /\bnpm\s+test\b/;

// Markdown link destination: the `dest` in `[text](dest)`.
const MARKDOWN_LINK_DEST_RE = /\]\(\s*([^)\s]+)/g;
// A run of characters that could plausibly form a path token.
const PATH_TOKEN_RE = /[A-Za-z0-9_@./-]+/g;
// A URL scheme prefix such as `http:`, `mailto:`, `ftp:`.
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * File extensions we treat as evidence that a token is a real file path.
 * Requiring a known extension is what keeps package names ("@babel/core"),
 * random slash text ("and/or", "TCP/IP") and bare domains out of the results.
 */
const FILE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'md', 'mdx', 'txt',
  'yml', 'yaml', 'toml', 'ini', 'env', 'lock', 'xml', 'sql', 'graphql', 'gql',
  'css', 'scss', 'sass', 'less', 'html', 'htm', 'svg', 'png', 'jpg', 'jpeg',
  'gif', 'ico', 'webp', 'sh', 'bash', 'prisma', 'config', 'vue', 'svelte',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'php',
]);

/**
 * Normalizes a raw doc token into a repo-relative file path, or returns null
 * if it doesn't look like a file reference (URL, package name, prose, etc).
 */
function normalizeFileRef(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;

  // Strip wrapping punctuation/quotes and trailing sentence punctuation.
  s = s.replace(/^[<("'`]+/, '').replace(/[>)"'`]+$/, '').replace(/[.,;:!?]+$/, '');
  if (!s) return null;

  // Reject URLs (scheme:, protocol-relative //, in-page anchors, addresses).
  if (s.startsWith('//') || s.startsWith('#') || s.includes('://')) return null;
  if (s.startsWith('www.') || URL_SCHEME_RE.test(s)) return null;

  // Drop any query string or anchor fragment, then normalize a leading ./ or /.
  s = s.split(/[?#]/)[0].replace(/^\.?\//, '');
  if (!s || /\s/.test(s)) return null;

  // Require a recognized file extension on the final path segment.
  const lastSegment = s.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0) return null;
  if (!FILE_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase())) return null;

  return s;
}

function extractNpmScriptClaims(line: string, source: DocClaimSource): NpmScriptClaim[] {
  const claims: NpmScriptClaim[] = [];
  const seen = new Set<string>();

  const add = (scriptName: string, command: string) => {
    if (seen.has(scriptName)) return;
    seen.add(scriptName);
    claims.push({ kind: 'npm-script', command, scriptName, source });
  };

  for (const match of line.matchAll(RUN_SCRIPT_RE)) add(match[1], match[0].trim());
  if (START_RE.test(line)) add('start', 'npm start');
  if (TEST_RE.test(line)) add('test', 'npm test');

  return claims;
}

function extractFileReferenceClaims(line: string, source: DocClaimSource): FileReferenceClaim[] {
  const claims: FileReferenceClaim[] = [];
  const seen = new Set<string>();

  const consider = (raw: string) => {
    const path = normalizeFileRef(raw);
    if (!path || seen.has(path)) return;
    seen.add(path);
    claims.push({ kind: 'file-reference', rawText: raw.trim(), path, source });
  };

  for (const match of line.matchAll(MARKDOWN_LINK_DEST_RE)) consider(match[1]);
  for (const match of line.matchAll(PATH_TOKEN_RE)) consider(match[0]);

  return claims;
}

/**
 * Extracts the claims the README makes: npm scripts it says to run, and file
 * paths it references. Detectors compare these against the TruthModel.
 */
export function extractDocClaims(snapshot: RepoSnapshot): DocClaim[] {
  const readme = findRootFileCaseInsensitive(snapshot, 'README.md');
  if (!readme) return [];

  const claims: DocClaim[] = [];

  readme.content.split(/\r?\n/).forEach((line, index) => {
    const source: DocClaimSource = {
      file: readme.path,
      line: index + 1,
      snippet: line.trim(),
    };
    claims.push(...extractNpmScriptClaims(line, source));
    claims.push(...extractFileReferenceClaims(line, source));
  });

  return claims;
}
