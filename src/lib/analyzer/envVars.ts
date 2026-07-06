import type { EnvVarOccurrence, RepoFile } from './types';

const ENV_EXAMPLE_RE = /^\.env\.(example|sample|template)$/i;

// Ubiquitous runtime / platform / CI vars that are noise unless a README
// explicitly documents them as required app config. Used by docker-drift so it
// doesn't flag them as compose-required "undocumented" vars.
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

// A `KEY=` (optionally `export KEY=`) assignment at the start of a line.
const ENV_ASSIGNMENT_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export function isEnvExampleFile(path: string): boolean {
  return ENV_EXAMPLE_RE.test(basename(path));
}

/**
 * Redacts the value of a `KEY=value` assignment so evidence snippets never
 * surface secret values — only variable names.
 */
export function redactEnvValues(line: string): string {
  return line.replace(/^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)\S.*$/, '$1<redacted>');
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
