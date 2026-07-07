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

// Stand-in script names from "wrap your script like such: `npm run myscript`"
// examples — placeholders, not real scripts, so they must not become claims.
const PLACEHOLDER_SCRIPTS = new Set([
  'myscript', 'my-script', 'yourscript', 'your-script', 'somescript', 'some-script',
  'scriptname', 'script-name', 'mycommand', 'my-command', 'yourcommand', 'your-command',
]);

// An uppercase `KEY=` assignment, e.g. `DATABASE_URL=...` in an env block. The
// lookbehind stops matching a fragment of a larger token (e.g. `UGRD` inside a
// URL query `var_UGRD=on`); the lookahead avoids JS comparisons like `X===y`.
const ENV_ASSIGNMENT_DOC_RE = /(?<![\w@$])([A-Z][A-Z0-9_]*)=(?!=)/g;
// A SCREAMING_SNAKE_CASE token in prose, e.g. "set DATABASE_URL in .env".
// Requiring an underscore keeps single-word acronyms (API, URL, MIT) out.
const ENV_SNAKE_RE = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
// Date/time format placeholders (e.g. YYYYMMDD, HHMMSS) — not env vars.
const DATE_FORMAT_RE = /^[YMDHS]{3,}$/;

// Package-manager invocations: `<manager> <subcommand> [args...]`. Longer
// subcommands are listed before their prefixes so alternation matches greedily.
const PM_SUBCOMMANDS =
  'install|ci|i|add|remove|rm|run-script|run|start|test|dev|build|lint|serve|preview|watch|exec|dlx|create|init|upgrade|update|up|publish|link|x';
// Captures manager, subcommand, and only the IMMEDIATE next token (a flag or a
// package name) — not a greedy run of words, so it never spans into the next
// command or prose ("… # or pnpm install or yarn install").
const PM_COMMAND_RE = new RegExp(
  `\\b(npm|yarn|pnpm|bun)\\s+(${PM_SUBCOMMANDS})\\b(?:[ \\t]+((?:-{1,2}[\\w-]+)|@?[\\w][\\w.@/-]*))?`,
  'gi',
);
// Subcommands that indicate running/setting up THIS repo (vs. installing a package).
const PM_RUN_SUBCOMMANDS = new Set([
  'ci', 'run', 'run-script', 'start', 'test', 'dev', 'build', 'lint', 'serve', 'preview', 'watch',
]);
// Words after `install` that are prose/other commands, not a package argument.
const NON_PACKAGE_ARGS = new Set(['or', 'and', 'then', 'npm', 'pnpm', 'yarn', 'bun']);
// Flags whose presence means "install a named package" (library install), not
// repo setup — e.g. `npm install --save-dev webpack`, `npm i -g some-cli`.
const LIBRARY_INSTALL_FLAGS = new Set([
  '-g', '--global',
  '-d', '--save-dev', '-s', '--save', '--save-prod', '-p',
  '--save-optional', '-o', '--save-exact', '-e', '--save-peer',
]);

/**
 * Whether a package-manager command reflects using *this* repo (setup/run) — as
 * opposed to a library-install example (`yarn add pkg`, `npm install -g cli`,
 * `npm install some-pkg`), which says nothing about the repo's own manager.
 */
function isRepoManagerCommand(subcommand: string, firstArg: string | undefined): boolean {
  const sub = subcommand.toLowerCase();
  if (PM_RUN_SUBCOMMANDS.has(sub)) return true;
  if (sub === 'install' || sub === 'i') {
    if (!firstArg) return true; // bare `install` → repo setup
    const arg = firstArg.toLowerCase();
    if (LIBRARY_INSTALL_FLAGS.has(arg)) return false; // -g / --save-dev / … → library install
    if (arg.startsWith('-')) return true; // other flags (--frozen-lockfile) → still setup
    return NON_PACKAGE_ARGS.has(arg); // a real package name ⇒ library install
  }
  return false; // add / remove / create / init / dlx / update / publish / link …
}

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
// A line stating a Node version is NOT a requirement (EOL / unsupported / range
// boundary), e.g. "Node.js 16 and 18 are end-of-life". Such lines are skipped.
const NODE_NEGATION_RE =
  /\b(end[-\s]?of[-\s]?life|eol|no longer support|not supported|unsupported|deprecat|drop(?:ped|ping)?\s+support|earlier than|older than|prior to|before node)\b/i;

// Docker commands. Requiring a verb after `docker` keeps hostnames like
// "docs.docker.com" (no space + verb) from matching.
const DOCKER_COMPOSE_RE = /\bdocker(?:\s+compose|-compose)\s+up(?:\s+[-\w.=]+)*/gi;
const DOCKER_BUILD_RE = /\bdocker\s+build\b(?:\s+[-\w./=]+)*/gi;
const DOCKER_RUN_RE = /\bdocker\s+run\b(?:\s+[-\w./=:]+)*/gi;
const DOCKER_BUILD_FILE_RE = /-f\s+([-\w./]+)/;

// Markdown link destination: the `dest` in `[text](dest)`.
const MARKDOWN_LINK_DEST_RE = /\]\(\s*([^)\s]+)/g;
// A run of characters that could plausibly form a path token. Parentheses are
// included so Next.js route-group segments (`app/(chat)/opengraph-image.png`)
// stay whole; normalizeFileRef still strips parens that merely wrap the token
// in prose (e.g. `(src/index.ts)`).
const PATH_TOKEN_RE = /[A-Za-z0-9_@./()-]+/g;
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

// Common web TLDs used to tell a hostname (`install.nocodb.com`) from a folder
// with a dot in its name (`my.folder`). Deliberately excludes ambiguous ccTLDs
// that collide with file extensions (e.g. `.sh`), which are handled as files.
const COMMON_TLDS = new Set([
  'com', 'org', 'net', 'io', 'dev', 'co', 'app', 'ai', 'xyz', 'me', 'info', 'cloud', 'gg',
]);

/** True when a path segment looks like `label.label.tld` with a common web TLD. */
function isDomainLike(segment: string): boolean {
  if (!/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(segment)) return false;
  return COMMON_TLDS.has(segment.slice(segment.lastIndexOf('.') + 1).toLowerCase());
}

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

  // Reject `host.tld/path` domain references (e.g. `install.nocodb.com/noco.sh`)
  // — a bare domain curl'd in a snippet, not a repo file. Only when the first
  // path segment is a hostname whose final label is a common web TLD.
  if (s.includes('/') && isDomainLike(s.slice(0, s.indexOf('/')))) return null;

  // Require a recognized file extension on the final path segment.
  const lastSegment = s.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot <= 0) return null;
  if (!FILE_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase())) return null;

  return s;
}

// Fenced-code languages we treat as shell (so `npm run X` in them is a real
// command). Empty = an unlabelled ``` block, commonly shell.
const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'shellsession', 'console', 'zsh']);
// A Dockerfile instruction line — its `npm run build` is image-build, not repo setup.
const DOCKERFILE_DIRECTIVE_RE = /^\s*(RUN|FROM|COPY|CMD|WORKDIR|ENV|EXPOSE|ENTRYPOINT|ARG|ADD)\b/;
// Inline code spans: the `x` in `run \`npm run build\``.
const INLINE_CODE_RE = /`([^`]+)`/g;

type LineContext = { inFence: boolean; fenceLang: string; isFenceMarker: boolean; isHeading: boolean };

/**
 * Returns the text of a line that should be scanned for npm commands, given its
 * markdown context — or null if none. Commands only count inside shell code
 * blocks (not Dockerfile directives) or inside inline-code spans in prose; a
 * heading or link-text mention like "avoid `npm start`" is ignored (a heading is
 * a title, not an instruction — even when the command is backticked).
 */
// Returns the command-bearing text fragments for a line, each scanned
// independently so a command in one fragment can never consume a token from an
// adjacent one (e.g. `` `npm run-script` `` … `` `--` `` in prose).
function commandContextTexts(line: string, ctx: LineContext): string[] {
  if (ctx.isFenceMarker) return [];
  if (ctx.inFence) {
    if (!SHELL_LANGS.has(ctx.fenceLang)) return [];
    if (DOCKERFILE_DIRECTIVE_RE.test(line)) return [];
    return [line];
  }
  if (ctx.isHeading) return [];
  // Prose: each inline-code span on its own — never joined.
  return [...line.matchAll(INLINE_CODE_RE)].map((m) => m[1]);
}

function extractNpmScriptClaims(texts: string[], source: DocClaimSource): NpmScriptClaim[] {
  const claims: NpmScriptClaim[] = [];
  const seen = new Set<string>();

  const add = (scriptName: string, command: string) => {
    if (seen.has(scriptName)) return;
    // A real script name has at least one alphanumeric char — reject punctuation
    // tokens like `--` (npm option separator picked up from an adjacent span).
    if (!/[a-z0-9]/i.test(scriptName)) return;
    if (PLACEHOLDER_SCRIPTS.has(scriptName.toLowerCase())) return;
    seen.add(scriptName);
    claims.push({ kind: 'npm-script', command, scriptName, source });
  };

  for (const text of texts) {
    for (const match of text.matchAll(RUN_SCRIPT_RE)) add(match[1], match[0].trim());
    if (START_RE.test(text)) add('start', 'npm start');
    if (TEST_RE.test(text)) add('test', 'npm test');
  }

  return claims;
}

// A full URL run — bare path tokens inside one are URL fragments, not repo files
// (e.g. `%40trpc/server.svg` inside a shields.io badge URL).
const URL_SPAN_RE = /\bhttps?:\/\/[^\s)"'<>]+/gi;

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

  const urlSpans = [...line.matchAll(URL_SPAN_RE)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  const insideUrl = (index: number) => urlSpans.some((s) => index >= s.start && index < s.end);

  // Markdown link targets are explicit file intent — accept even without a `/`.
  for (const match of line.matchAll(MARKDOWN_LINK_DEST_RE)) consider(match[1], false);
  // Bare tokens scanned from prose must look path-like and not sit inside a URL.
  for (const match of line.matchAll(PATH_TOKEN_RE)) {
    if (insideUrl(match.index ?? 0)) continue;
    consider(match[0], true);
  }

  return claims;
}

// Placeholder tokens in docs are not real env vars: `YOUR_*`/`MY_*` fill-ins, or
// a token wrapped in `[...]` / `<...>` (e.g. `[YOUR_RESPONSIBILITY_1]`).
const PLACEHOLDER_ENV_PREFIX = /^(YOUR|MY|SOME|EXAMPLE|SAMPLE|PLACEHOLDER|CHANGE|CHANGEME)_/i;

function isPlaceholderEnv(name: string, line: string, index: number): boolean {
  if (PLACEHOLDER_ENV_PREFIX.test(name)) return true;
  const before = line[index - 1];
  return before === '[' || before === '<';
}

function extractEnvVarClaims(
  line: string,
  source: DocClaimSource,
  ctx: LineContext,
): EnvVarClaim[] {
  // A heading is a title (e.g. `##### CLIENT_FETCH_ERROR`), not env documentation.
  if (ctx.isHeading) return [];

  const claims: EnvVarClaim[] = [];
  const seen = new Set<string>();

  const add = (name: string, rawText: string) => {
    if (name.length < 2 || seen.has(name)) return;
    seen.add(name);
    // rawText intentionally never includes an assignment's value.
    claims.push({ kind: 'env-var', name, rawText, source });
  };

  for (const match of line.matchAll(ENV_ASSIGNMENT_DOC_RE)) {
    if (DATE_FORMAT_RE.test(match[1])) continue; // e.g. YYYYMMDD=<date>
    if (isPlaceholderEnv(match[1], line, match.index ?? 0)) continue;
    add(match[1], `${match[1]}=`);
  }
  for (const match of line.matchAll(ENV_SNAKE_RE)) {
    // Skip SCREAMING_SNAKE tokens that are really part of a filename, e.g.
    // `PRODUCT_SPEC.md` / `MVP_CHECKLIST.md` — a dot + extension immediately
    // after the token. (A sentence-ending "SET FOO." has no letter after the
    // dot, so real env vars in prose are unaffected.)
    const after = line.slice((match.index ?? 0) + match[0].length);
    if (/^\.[A-Za-z]/.test(after)) continue;
    if (isPlaceholderEnv(match[1], line, match.index ?? 0)) continue;
    add(match[1], match[1]);
  }

  return claims;
}

function extractPackageCommandClaims(
  texts: string[],
  source: DocClaimSource,
): PackageCommandClaim[] {
  const claims: PackageCommandClaim[] = [];

  for (const text of texts) {
    for (const match of text.matchAll(PM_COMMAND_RE)) {
      const [, manager, subcommand, firstArg] = match;
      if (!isRepoManagerCommand(subcommand, firstArg)) continue;
      claims.push({
        kind: 'command',
        packageManager: manager as PackageManager,
        command: match[0].trim(),
        source,
      });
    }
  }

  return claims;
}

function extractNodeVersionClaims(line: string, source: DocClaimSource): NodeVersionClaim[] {
  // Lines that state a version is unsupported/EOL aren't requirement claims,
  // e.g. "Node.js 16 and 18 are end-of-life, so we no longer support …".
  if (NODE_NEGATION_RE.test(line)) return [];

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

function extractDockerCommandClaims(texts: string[], source: DocClaimSource): DockerCommandClaim[] {
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

  for (const line of texts) {
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
  let inFence = false;
  let fenceLang = '';

  readme.content.split(/\r?\n/).forEach((line, index) => {
    const fenceMatch = /^\s*(?:```|~~~)(.*)$/.exec(line);
    const isFenceMarker = fenceMatch !== null;
    if (isFenceMarker) {
      if (inFence) {
        inFence = false;
        fenceLang = '';
      } else {
        inFence = true;
        // Language token immediately after the fence (e.g. ```bash / ```js).
        fenceLang = (fenceMatch[1].trim().split(/\s+/)[0] ?? '').toLowerCase();
      }
    }
    const isHeading = HEADING_RE.test(line);
    const ctx: LineContext = { inFence, fenceLang, isFenceMarker, isHeading };

    if (isHeading) awayFromRepoRoot = false;
    const cd = CD_COMMAND_RE.exec(line);
    if (cd) awayFromRepoRoot = !cdTargetIsRepo(cd[1], repoName);

    const source: DocClaimSource = {
      file: readme.path,
      line: index + 1,
      snippet: line.trim(),
    };
    // Commands (npm scripts + package-manager) only count in code contexts
    // (shell block / inline code), never prose, headings, or tables.
    const commandTexts = commandContextTexts(line, ctx);
    if (commandTexts.length > 0) {
      if (!awayFromRepoRoot) claims.push(...extractNpmScriptClaims(commandTexts, source));
      claims.push(...extractPackageCommandClaims(commandTexts, source));
      claims.push(...extractDockerCommandClaims(commandTexts, source));
    }
    // File references only count in doc context — never inside fenced code blocks.
    if (!ctx.inFence && !ctx.isFenceMarker) {
      claims.push(...extractFileReferenceClaims(line, source));
    }
    claims.push(...extractEnvVarClaims(line, source, ctx));
    claims.push(...extractNodeVersionClaims(line, source));
  });

  return claims;
}
