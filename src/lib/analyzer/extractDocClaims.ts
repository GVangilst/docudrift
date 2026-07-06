import { parsePortMapping } from './docker';
import { findRootFileCaseInsensitive } from './repoSnapshot';
import type {
  DockerCommandClaim,
  DockerCommandKind,
  DocClaim,
  DocClaimSource,
  EnvVarClaim,
  FileReferenceClaim,
  NodeVersionClaim,
  NpmScriptClaim,
  PackageCommandClaim,
  PackageManager,
  PortMapping,
  RepoSnapshot,
} from './types';

const RUN_SCRIPT_RE = /\bnpm\s+run(?:-script)?\s+([a-zA-Z0-9_:.-]+)/g;
const START_RE = /\bnpm\s+start\b/;
const TEST_RE = /\bnpm\s+test\b/;

// An uppercase `KEY=` assignment, e.g. `DATABASE_URL=...` in an env block.
// The negative lookahead avoids matching JS comparisons like `X===y`.
const ENV_ASSIGNMENT_DOC_RE = /([A-Z][A-Z0-9_]*)=(?!=)/g;
// A SCREAMING_SNAKE_CASE token in prose, e.g. "set DATABASE_URL in .env".
// Requiring an underscore keeps single-word acronyms (API, URL, MIT) out.
const ENV_SNAKE_RE = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;

// Package-manager invocations: `<manager> <subcommand> [args...]`. Requiring a
// known subcommand keeps prose like "npm is great" from matching. The trailing
// group captures the rest of the command (e.g. the "dev" in "npm run dev").
const PM_SUBCOMMANDS =
  'install|i|ci|add|remove|rm|run|run-script|start|test|dev|build|lint|serve|preview|watch|exec|dlx|create|init|update|up|upgrade|publish|link|x';
const PM_COMMAND_RE = new RegExp(
  `\\b(npm|yarn|pnpm|bun)\\s+(?:${PM_SUBCOMMANDS})\\b(?:\\s+[@\\w:./-]+)*`,
  'g',
);

// A Node version expression: optional operator, optional `v`, dotted digits,
// optional `.x` or `+` suffix — matches "18", ">=18", "18+", "18.x", "20.11.1".
const NODE_VERSION_EXPR = '(?:>=|<=|>|<|\\^|~)?\\s*v?\\d+(?:\\.\\d+){0,2}(?:\\.x|\\+)?';
// "Node 18", "Node.js >=20", "Requires Node 20", "node version 20.11.1", etc.
const NODE_MENTION_RE = new RegExp(
  `\\bnode(?:\\.js)?\\s+(?:version\\s+)?(${NODE_VERSION_EXPR})`,
  'gi',
);
// "nvm use 20", "nvm install 18".
const NVM_RE = new RegExp(`\\bnvm\\s+(?:use|install)\\s+(${NODE_VERSION_EXPR})`, 'gi');

// Docker commands. Requiring a verb after `docker` keeps hostnames like
// "docs.docker.com" (no space + verb) from matching.
const DOCKER_COMPOSE_RE = /\bdocker(?:\s+compose|-compose)\s+up(?:\s+[-\w.=]+)*/gi;
const DOCKER_BUILD_RE = /\bdocker\s+build\b(?:\s+[-\w./=]+)*/gi;
const DOCKER_RUN_RE = /\bdocker\s+run\b(?:\s+[-\w./=:]+)*/gi;
const DOCKER_BUILD_FILE_RE = /-f\s+([-\w./]+)/;

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

  const consider = (raw: string, mustLookLikePath: boolean) => {
    // A bare token from prose must contain a path separator to count as a file
    // reference. This keeps technology names like "Node.js" / "Vue.js" (which
    // end in a known extension but have no `/`) from being read as file paths.
    if (mustLookLikePath && !raw.includes('/')) return;
    const path = normalizeFileRef(raw);
    if (!path || seen.has(path)) return;
    seen.add(path);
    claims.push({ kind: 'file-reference', rawText: raw.trim(), path, source });
  };

  // Markdown link targets are explicit file intent — accept even without a `/`.
  for (const match of line.matchAll(MARKDOWN_LINK_DEST_RE)) consider(match[1], false);
  // Bare tokens scanned from prose must look path-like.
  for (const match of line.matchAll(PATH_TOKEN_RE)) consider(match[0], true);

  return claims;
}

function extractEnvVarClaims(line: string, source: DocClaimSource): EnvVarClaim[] {
  const claims: EnvVarClaim[] = [];
  const seen = new Set<string>();

  const add = (name: string, rawText: string) => {
    if (name.length < 2 || seen.has(name)) return;
    seen.add(name);
    // rawText intentionally never includes an assignment's value.
    claims.push({ kind: 'env-var', name, rawText, source });
  };

  for (const match of line.matchAll(ENV_ASSIGNMENT_DOC_RE)) add(match[1], `${match[1]}=`);
  for (const match of line.matchAll(ENV_SNAKE_RE)) {
    // Skip SCREAMING_SNAKE tokens that are really part of a filename, e.g.
    // `PRODUCT_SPEC.md` / `MVP_CHECKLIST.md` — a dot + extension immediately
    // after the token. (A sentence-ending "SET FOO." has no letter after the
    // dot, so real env vars in prose are unaffected.)
    const after = line.slice((match.index ?? 0) + match[0].length);
    if (/^\.[A-Za-z]/.test(after)) continue;
    add(match[1], match[1]);
  }

  return claims;
}

function extractPackageCommandClaims(
  line: string,
  source: DocClaimSource,
): PackageCommandClaim[] {
  const claims: PackageCommandClaim[] = [];

  for (const match of line.matchAll(PM_COMMAND_RE)) {
    claims.push({
      kind: 'command',
      packageManager: match[1] as PackageManager,
      command: match[0].trim(),
      source,
    });
  }

  return claims;
}

function extractNodeVersionClaims(line: string, source: DocClaimSource): NodeVersionClaim[] {
  const claims: NodeVersionClaim[] = [];
  const seen = new Set<string>();

  const add = (raw: string, versionToken: string) => {
    const version = versionToken.replace(/\s+/g, '');
    if (!version || seen.has(version)) return;
    seen.add(version);
    claims.push({ kind: 'node-version', raw: raw.trim(), version, source });
  };

  for (const match of line.matchAll(NODE_MENTION_RE)) add(match[0], match[1]);
  for (const match of line.matchAll(NVM_RE)) add(match[0], match[1]);

  return claims;
}

function parseRunPorts(command: string): PortMapping[] {
  const ports: PortMapping[] = [];
  for (const match of command.matchAll(/(?:-p|--publish)[\s=]+(\S+)/g)) {
    const mapping = parsePortMapping(match[1]);
    if (mapping) ports.push(mapping);
  }
  return ports;
}

function parseRunEnvKeys(command: string): string[] {
  const keys: string[] = [];
  for (const match of command.matchAll(/(?:-e|--env)[\s=]+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    keys.push(match[1]);
  }
  return keys;
}

function extractDockerCommandClaims(line: string, source: DocClaimSource): DockerCommandClaim[] {
  const claims: DockerCommandClaim[] = [];
  const seen = new Set<string>();

  const add = (
    command: DockerCommandKind,
    raw: string,
    extra?: { dockerfile?: string; ports?: PortMapping[]; envKeys?: string[] },
  ) => {
    const key = `${command}:${extra?.dockerfile ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    claims.push({
      kind: 'docker-command',
      command,
      raw: raw.trim(),
      dockerfile: extra?.dockerfile,
      ports: extra?.ports?.length ? extra.ports : undefined,
      envKeys: extra?.envKeys?.length ? extra.envKeys : undefined,
      source,
    });
  };

  for (const match of line.matchAll(DOCKER_COMPOSE_RE)) add('compose', match[0]);
  for (const match of line.matchAll(DOCKER_BUILD_RE)) {
    const fileMatch = DOCKER_BUILD_FILE_RE.exec(match[0]);
    add('build', match[0], { dockerfile: fileMatch ? fileMatch[1] : undefined });
  }
  for (const match of line.matchAll(DOCKER_RUN_RE)) {
    add('run', match[0], {
      ports: parseRunPorts(match[0]),
      envKeys: parseRunEnvKeys(match[0]),
    });
  }

  return claims;
}

const HEADING_RE = /^\s{0,3}#{1,6}\s/;
// A `cd <dir>` used as a command (line start, prompt, or after &&/;/|), not prose.
const CD_COMMAND_RE = /(?:^\s*|[$>&|;]\s*)cd\s+(\S+)/;

/** Whether a `cd` target is the repo itself (so npm commands still apply to it). */
function cdTargetIsRepo(target: string, repoName: string): boolean {
  const cleaned = target.replace(/^['"]+|['"]+$/g, '');
  const base = cleaned.split('/').filter(Boolean).pop() ?? cleaned;
  return base.toLowerCase() === repoName.toLowerCase();
}

/**
 * Extracts the claims the README makes: npm scripts it says to run, file paths
 * it references, and env vars it documents. Detectors compare these against the
 * TruthModel.
 *
 * npm-script claims are only attributed to this repo's package.json while the
 * documented shell context is at the repo root. A `cd` into another directory
 * (e.g. a generated app under `/tmp/foo`) suppresses them until the next heading,
 * so a "generate an app and run it" quick-start isn't read as drift.
 */
export function extractDocClaims(snapshot: RepoSnapshot): DocClaim[] {
  const readme = findRootFileCaseInsensitive(snapshot, 'README.md');
  if (!readme) return [];

  const repoName = snapshot.repo.name;
  const claims: DocClaim[] = [];
  let awayFromRepoRoot = false;

  readme.content.split(/\r?\n/).forEach((line, index) => {
    if (HEADING_RE.test(line)) awayFromRepoRoot = false;
    const cd = CD_COMMAND_RE.exec(line);
    if (cd) awayFromRepoRoot = !cdTargetIsRepo(cd[1], repoName);

    const source: DocClaimSource = {
      file: readme.path,
      line: index + 1,
      snippet: line.trim(),
    };
    if (!awayFromRepoRoot) claims.push(...extractNpmScriptClaims(line, source));
    claims.push(...extractFileReferenceClaims(line, source));
    claims.push(...extractEnvVarClaims(line, source));
    claims.push(...extractPackageCommandClaims(line, source));
    claims.push(...extractNodeVersionClaims(line, source));
    claims.push(...extractDockerCommandClaims(line, source));
  });

  return claims;
}
