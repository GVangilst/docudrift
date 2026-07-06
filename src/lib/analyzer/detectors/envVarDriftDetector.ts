import { isCommonEnv, redactEnvValues } from '../envVars';
import { isToolingPath } from '../keyFiles';
import type {
  DocClaim,
  DriftIssue,
  EnvVarClaim,
  EnvVarOccurrence,
  TruthModel,
} from '../types';

const DETECTOR_ID = 'env-var-drift';

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
  // App-runtime reads only — excludes build tooling / scripts / config. The
  // high-severity "source reads X" rule uses this so a var read *only* in tooling
  // isn't flagged; the full `code` set still counts as "usage" everywhere else.
  const appCode = firstByName(truth.envVarsFromCode.filter((occ) => !isToolingPath(occ.file)));

  const docNames = new Set(documented.keys());
  const exampleNames = new Set(examples.keys());
  const codeNames = new Set(code.keys());
  // Compose env keys count as "usage" — a var wired into docker-compose isn't unused.
  const composeEnvNames = new Set(truth.docker.composeEnvKeys);

  // A common/platform var is ignorable unless the README clearly documents it.
  const isIgnored = (name: string) => isCommonEnv(name) && !docNames.has(name);

  const issues: DriftIssue[] = [];

  // Rule A (medium): documented in README, but nothing declares or uses it.
  // Only trustworthy when all source was fetched — otherwise "nothing uses it"
  // may just mean the consuming file was dropped by the fetch cap.
  for (const [name, claim] of truth.sourceComplete ? documented : []) {
    if (exampleNames.has(name) || codeNames.has(name) || composeEnvNames.has(name)) continue;
    // Common/platform knobs (NODE_OPTIONS, …) are consumed by Node/tooling, not
    // app source — "documents it but nothing reads it" is not drift for those.
    if (isCommonEnv(name)) continue;
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

  // Rule B (high): read in app source, but undocumented and not in any example.
  // Uses appCode so a var read only in build tooling / scripts isn't flagged.
  for (const [name, occ] of appCode) {
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
