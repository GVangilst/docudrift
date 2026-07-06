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
 * Flags env vars that the app's source reads (`process.env.X` / `import.meta.env.X`)
 * but that are documented nowhere — not in the README and not in any `.env.example`.
 * This is a best-effort documentation-completeness check (it reads free-form prose
 * for "documented?" over a capped source sample), so findings are `warning`, not
 * `error`. The old "documented in the README but nothing uses it" rule was removed:
 * it couldn't verify usage across YAML/CI/runtime/uncapped source and produced
 * almost only false positives. Only variable names are surfaced; values are redacted.
 */
export function envVarDriftDetector(claims: DocClaim[], truth: TruthModel): DriftIssue[] {
  const documented = new Map<string, EnvVarClaim>();
  for (const claim of claims) {
    if (claim.kind !== 'env-var') continue;
    if (!documented.has(claim.name)) documented.set(claim.name, claim);
  }

  const exampleNames = new Set(truth.envVarsFromExamples.map((occ) => occ.name));
  // App-runtime reads only — excludes build tooling / scripts / config so a var
  // read *only* in tooling isn't flagged.
  const appCode = firstByName(truth.envVarsFromCode.filter((occ) => !isToolingPath(occ.file)));

  const docNames = new Set(documented.keys());

  // A common/platform var is ignorable unless the README clearly documents it.
  const isIgnored = (name: string) => isCommonEnv(name) && !docNames.has(name);

  const issues: DriftIssue[] = [];

  // The app reads an env var, but it is documented nowhere (README or .env.example).
  // Heuristic (prose "documented?" over a capped source sample) → warning, not error.
  for (const [name, occ] of appCode) {
    if (docNames.has(name) || exampleNames.has(name)) continue;
    if (isIgnored(name)) continue;
    issues.push({
      id: `${DETECTOR_ID}:undocumented-usage:${name}`,
      detectorId: DETECTOR_ID,
      severity: 'warning',
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
