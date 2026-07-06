import type { EnvVarOccurrence, RepoFile } from './types';

const SOURCE_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs']);
const ENV_EXAMPLE_RE = /^\.env\.(example|sample|template)$/i;

// Ubiquitous runtime / platform / CI vars that are noise unless a README
// explicitly documents them as required app config. Shared by env-var-drift and
// docker-drift so neither flags them.
const COMMON_ENV_VARS = new Set([
  // OS / shell
  'PATH', 'HOME', 'PWD', 'USER', 'SHELL', 'TERM', 'LANG', 'TMPDIR', 'TZ', 'HOSTNAME', 'LOGNAME',
  // Node runtime / native tooling
  'NODE_ENV', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_NO_WARNINGS', 'NODE_TLS_REJECT_UNAUTHORIZED',
  'UV_THREADPOOL_SIZE', 'NAPI_RS_ASYNC_WORK_POOL_SIZE',
  // Networking
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  // CI / logging / misc / package-manager-injected
  'CI', 'DEBUG', 'FORCE_COLOR', 'NO_COLOR', 'PORT', 'INIT_CWD', 'PROJECT_CWD', 'CRON_SECRET',
  // GitHub Actions built-ins
  'GITHUB_TOKEN', 'GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_WORKSPACE', 'GITHUB_SHA', 'GITHUB_REF',
  // Netlify build environment
  'DEPLOY_PRIME_URL', 'COMMIT_REF', 'BRANCH', 'REVIEW_ID', 'PULL_REQUEST', 'CONTEXT',
  // Framework/platform runtime
  'NEXT_RUNTIME', 'VERCEL', 'VERCEL_URL', 'VERCEL_ENV',
]);

// Host-injected platform / CI / test-runner prefixes, not app config.
const COMMON_ENV_PREFIXES = [
  'npm_', 'VERCEL_', 'RAILWAY_', 'RENDER_', 'CF_PAGES', 'NETLIFY', 'FLY_', 'GITHUB_', 'RUNNER_',
  'INPUT_', 'PLAYWRIGHT_', 'DEBUG_',
];

export function isCommonEnv(name: string): boolean {
  return COMMON_ENV_VARS.has(name) || COMMON_ENV_PREFIXES.some((p) => name.startsWith(p));
}

// Env var read patterns in source code. All capture the variable name only.
// `importMeta` patterns are Vite's `import.meta.env`, which exposes build-time
// built-ins that aren't user-provided config.
const CODE_ENV_PATTERNS: { re: RegExp; importMeta: boolean }[] = [
  { re: /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, importMeta: false },
  { re: /process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g, importMeta: false },
  { re: /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, importMeta: true },
  { re: /import\.meta\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g, importMeta: true },
];

// Vite `import.meta.env` built-ins — always present, never app config.
const VITE_BUILTINS = new Set(['PROD', 'DEV', 'MODE', 'SSR', 'BASE_URL']);

// A `KEY=` (optionally `export KEY=`) assignment at the start of a line.
const ENV_ASSIGNMENT_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export function isEnvExampleFile(path: string): boolean {
  return ENV_EXAMPLE_RE.test(basename(path));
}

export function isSourceFile(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot !== -1 && SOURCE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

/**
 * Redacts the value of a `KEY=value` assignment so evidence snippets never
 * surface secret values — only variable names. Non-assignment lines (prose,
 * `process.env.X` reads) are returned unchanged.
 */
export function redactEnvValues(line: string): string {
  return line.replace(
    /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)\S.*$/,
    '$1<redacted>',
  );
}

/** Extracts env var names declared in a `.env.example`-style file. */
export function extractEnvVarsFromExample(file: RepoFile): EnvVarOccurrence[] {
  const occurrences: EnvVarOccurrence[] = [];

  file.content.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = ENV_ASSIGNMENT_RE.exec(line);
    if (!match) return;

    occurrences.push({
      name: match[1],
      file: file.path,
      line: index + 1,
      snippet: redactEnvValues(trimmed),
    });
  });

  return occurrences;
}

// Generic example/placeholder names — almost always docs, not real config.
const PLACEHOLDER_ENV_NAMES = new Set([
  'FOO', 'BAR', 'BAZ', 'QUX', 'KEY', 'VALUE', 'VAR', 'NAME', 'EXAMPLE',
  'PLACEHOLDER', 'MY_VAR', 'YOUR_VAR', 'SOME_VAR', 'MY_KEY', 'YOUR_KEY',
]);

/** Single-letter and well-known placeholder names aren't real env vars. */
function isPlaceholderName(name: string): boolean {
  return name.length === 1 || PLACEHOLDER_ENV_NAMES.has(name);
}

/**
 * Best-effort check for whether a match sits inside a comment, so `process.env.X`
 * shown in a JSDoc/`//` example isn't counted as a real read. Line-based (no full
 * tokenizer): whole-line comments, JSDoc `*` continuations, and inline `//`.
 */
function isInsideComment(line: string, matchIndex: number): boolean {
  if (/^\s*(\/\/|\/\*|\*|#|<!--)/.test(line)) return true;
  const inlineComment = line.indexOf('//');
  return inlineComment !== -1 && inlineComment < matchIndex && line[inlineComment - 1] !== ':';
}

/** Extracts env var names read from source code (process.env / import.meta.env). */
export function extractEnvUsagesFromSource(file: RepoFile): EnvVarOccurrence[] {
  const occurrences: EnvVarOccurrence[] = [];

  file.content.split(/\r?\n/).forEach((line, index) => {
    const seenOnLine = new Set<string>();
    for (const { re, importMeta } of CODE_ENV_PATTERNS) {
      for (const match of line.matchAll(re)) {
        const name = match[1];
        if (seenOnLine.has(name) || isPlaceholderName(name)) continue;
        if (importMeta && VITE_BUILTINS.has(name)) continue;
        if (isInsideComment(line, match.index ?? 0)) continue;
        // A write (`process.env.X = …`) sets config, it doesn't read undocumented
        // config — skip it. `===`/`==` comparisons are reads and are kept.
        const after = line.slice((match.index ?? 0) + match[0].length);
        if (/^\s*=(?!=)/.test(after)) continue;
        seenOnLine.add(name);
        occurrences.push({
          name,
          file: file.path,
          line: index + 1,
          snippet: redactEnvValues(line.trim()),
        });
      }
    }
  });

  return occurrences;
}
