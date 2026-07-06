import { redactEnvValues } from '../envVars';
import type {
  DocClaim,
  DriftIssue,
  EnvVarClaim,
  EnvVarOccurrence,
  TruthModel,
} from '../types';

const DETECTOR_ID = 'env-var-drift';

// Ubiquitous runtime / platform / tooling vars that are noise unless the README
// explicitly documents them as required app config.
const COMMON_ENV_VARS = new Set([
  // OS / shell
  'PATH', 'HOME', 'PWD', 'USER', 'SHELL', 'TERM', 'LANG', 'TMPDIR', 'TZ', 'HOSTNAME', 'LOGNAME',
  // Node runtime / native tooling
  'NODE_ENV', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_NO_WARNINGS', 'NODE_TLS_REJECT_UNAUTHORIZED',
  'UV_THREADPOOL_SIZE', 'NAPI_RS_ASYNC_WORK_POOL_SIZE',
  // CI / logging / misc
  'CI', 'DEBUG', 'FORCE_COLOR', 'NO_COLOR', 'PORT',
  // Platform-injected
  'VERCEL', 'VERCEL_URL', 'VERCEL_ENV',
]);

// Platform env prefixes that are host-injected, not app config.
const COMMON_ENV_PREFIXES = ['npm_', 'VERCEL_', 'RAILWAY_', 'RENDER_', 'CF_PAGES', 'NETLIFY'];

function isCommonEnv(name: string): boolean {
  return COMMON_ENV_VARS.has(name) || COMMON_ENV_PREFIXES.some((p) => name.startsWith(p));
}

/** Keep the first occurrence per name so evidence is stable and deduped. */
function firstByName(occurrences: EnvVarOccurrence[]): Map<string, EnvVarOccurrence> {
  const map = new Map<string, EnvVarOccurrence>();
  for (const occ of occurrences) {
    if (!map.has(occ.name)) map.set(occ.name, occ);
  }
  return map;
}

/**
 * Cross-checks env vars documented in the README against those declared in
 * `.env.example` files, read in source code, and referenced in docker-compose.
 * Emits one issue per env var:
 *
 * - documented but neither exampled, used, nor in compose → warning (medium)
 * - used in source but undocumented + no example          → error (high)
 *
 * ".env.example vars not repeated in the README" is intentionally NOT flagged —
 * the example file *is* the documentation, so that check was pure noise.
 * Only variable names are ever surfaced; values are redacted upstream.
 */
export function envVarDriftDetector(claims: DocClaim[], truth: TruthModel): DriftIssue[] {
  const documented = new Map<string, EnvVarClaim>();
  for (const claim of claims) {
    if (claim.kind !== 'env-var') continue;
    if (!documented.has(claim.name)) documented.set(claim.name, claim);
  }

  const examples = firstByName(truth.envVarsFromExamples);
  const code = firstByName(truth.envVarsFromCode);

  const docNames = new Set(documented.keys());
  const exampleNames = new Set(examples.keys());
  const codeNames = new Set(code.keys());
  // Compose env keys count as "usage" — a var wired into docker-compose isn't unused.
  const composeEnvNames = new Set(truth.docker.composeEnvKeys);

  // A common/platform var is ignorable unless the README clearly documents it.
  const isIgnored = (name: string) => isCommonEnv(name) && !docNames.has(name);

  const issues: DriftIssue[] = [];

  // Rule A (medium): documented in README, but nothing declares or uses it.
  for (const [name, claim] of documented) {
    if (exampleNames.has(name) || codeNames.has(name) || composeEnvNames.has(name)) continue;
    issues.push({
      id: `${DETECTOR_ID}:documented-unused:${name}`,
      detectorId: DETECTOR_ID,
      severity: 'warning',
      title: `README documents \`${name}\` but nothing uses it`,
      description: `The README documents the \`${name}\` environment variable (as \`${claim.rawText}\`), but it is not present in any .env example file and is not read anywhere in source code.`,
      evidence: [
        {
          label: 'README',
          file: claim.source.file,
          line: claim.source.line,
          snippet: redactEnvValues(claim.source.snippet),
        },
      ],
      suggestedFix: `Add \`${name}\` to .env.example and read it in code, or remove it from the README if it is no longer used.`,
    });
  }

  // Rule B (high): read in source, but undocumented and not in any example.
  for (const [name, occ] of code) {
    if (docNames.has(name) || exampleNames.has(name)) continue;
    if (isIgnored(name)) continue;
    issues.push({
      id: `${DETECTOR_ID}:undocumented-usage:${name}`,
      detectorId: DETECTOR_ID,
      severity: 'error',
      title: `Source reads \`${name}\` but it is undocumented`,
      description: `Source code reads the \`${name}\` environment variable, but it is not documented in the README or present in any .env example file.`,
      evidence: [
        {
          label: 'source',
          file: occ.file,
          line: occ.line,
          snippet: redactEnvValues(occ.snippet),
        },
      ],
      suggestedFix: `Document \`${name}\` in the README and add it to .env.example.`,
    });
  }

  return issues;
}
